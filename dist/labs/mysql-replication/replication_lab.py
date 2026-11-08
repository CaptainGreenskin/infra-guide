"""Two real MySQL 8.4.13 servers: read views, apply lag and a planned switchover.

Python 3.9+ and a Linux Docker daemon. Synthetic data, no published ports.
Creates and removes only the resources whose IDs this process created.
This is not a production failover controller, proxy or fencing service.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import selectors
import subprocess
import tempfile
import time
import uuid


IMAGE = 'mysql@sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902'
VERSION = '8.4.13'
ROOT_PASSWORD = 'isolated-guide-root'
WRITER_PASSWORD = 'isolated-guide-writer'
REPL_PASSWORD = 'isolated-guide-replica'
DB = 'replica_lab'


def quoted(value):
    return "'" + str(value).replace("'", "''") + "'"


class Session:
    """One mysql client process keeps one actual server connection alive."""
    def __init__(self, lab, name):
        self.process = subprocess.Popen(lab.client(name), stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                        text=True, bufsize=1)
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.process.stdout, selectors.EVENT_READ)

    def request(self, sql, returns_json=False):
        marker = uuid.uuid4().hex
        statement = sql.rstrip().rstrip(';')+';\n'
        if not returns_json:
            statement += "SELECT JSON_OBJECT('__marker', '"+marker+"');\n"
        self.process.stdin.write(statement)
        self.process.stdin.flush()
        deadline = time.monotonic()+12
        while time.monotonic() < deadline:
            if not self.selector.select(max(.01, deadline-time.monotonic())):
                break
            line = self.process.stdout.readline()
            if not line:
                detail = self.process.stderr.read()
                raise RuntimeError('Persistent mysql session closed: '+detail[-1000:])
            result = json.loads(line)
            if returns_json:
                return result
            if result.get('__marker') == marker:
                return None
        raise TimeoutError('Persistent mysql session exceeded its command deadline')

    def balance(self):
        return self.request("SELECT JSON_OBJECT('balance',balance,'connection',CONNECTION_ID(),"
                            "'isolation',@@transaction_isolation) FROM replica_lab.account WHERE id=1", True)

    def close(self):
        if self.process.poll() is None:
            try:
                self.process.stdin.write('ROLLBACK;\nquit\n')
                self.process.stdin.flush()
                self.process.communicate(timeout=4)
            except (BrokenPipeError, subprocess.TimeoutExpired):
                self.process.kill()
                self.process.communicate(timeout=4)
        self.selector.close()


class Lab:
    def __init__(self, image):
        self.image = image
        self.prefix = 'infra-replica-'+uuid.uuid4().hex[:12]
        self.network = None
        self.containers, self.volumes, self.sessions = [], [], []

    def docker(self, *args, data=None, check=True, timeout=30):
        result = subprocess.run(['docker', *args], input=data, capture_output=True,
                                text=True, timeout=timeout)
        if check and result.returncode:
            raise RuntimeError('docker '+args[0]+' failed: '+(result.stderr or result.stdout)[-1800:])
        return result

    def client(self, name, user='root', headings=False):
        password = ROOT_PASSWORD if user == 'root' else WRITER_PASSWORD
        args = ['docker','exec','-i','-e','MYSQL_PWD='+password,name,'mysql',
                '-u'+user,'--batch','--raw','--unbuffered','--connect-timeout=3']
        if not headings:
            args.append('--skip-column-names')
        return args

    def sql(self, name, sql, user='root', check=True, timeout=30, headings=False):
        result = subprocess.run(self.client(name,user,headings), input=sql+'\n', capture_output=True,
                                text=True, timeout=timeout)
        if check and result.returncode:
            raise RuntimeError('mysql command failed: '+result.stderr[-1500:])
        return result

    def scalar(self, name, sql):
        output = self.sql(name,sql).stdout.strip()
        assert '\n' not in output, 'expected a scalar, got '+repr(output)
        return output

    def setup(self):
        self.docker('info','--format','{{.OSType}}')
        self.docker('pull',self.image,timeout=180)
        network_name = self.prefix+'-network'
        self.network = self.docker('network','create','--internal','--label','infraguide=mysql-replication',network_name).stdout.strip()
        names = []
        for role,server_id in [('source',11),('replica',22)]:
            volume = self.prefix+'-'+role+'-data'
            self.docker('volume','create','--label','infraguide=mysql-replication',volume)
            self.volumes.append(volume)
            name = self.prefix+'-'+role
            container = self.docker('create','--name',name,'--network',network_name,
                '--network-alias',role,'--memory','1g','--pids-limit','256',
                '--env','MYSQL_ROOT_PASSWORD='+ROOT_PASSWORD,
                '--mount','type=volume,source='+volume+',target=/var/lib/mysql',self.image,
                '--server-id='+str(server_id),'--gtid-mode=ON','--enforce-gtid-consistency=ON',
                '--log-bin=mysql-bin','--log-replica-updates=ON','--binlog-format=ROW',
                '--replica-parallel-workers=1','--innodb-buffer-pool-size=67108864',
                '--innodb-redo-log-capacity=67108864','--max-connections=30',
                '--sync-binlog=1','--innodb-flush-log-at-trx-commit=1').stdout.strip()
            self.containers.append(container)
            names.append(name)
            self.docker('start',container)
        for name in names:
            deadline = time.monotonic()+120
            while True:
                probe = self.sql(name,'SELECT IF(@@port=3306 AND @@skip_networking=0,1,0)',check=False,timeout=7)
                if probe.returncode == 0 and probe.stdout.strip() == '1':
                    break
                if time.monotonic() >= deadline:
                    logs = self.docker('logs',name,check=False).stdout[-2000:]
                    raise TimeoutError('MySQL was not ready: '+logs)
                time.sleep(.5)
            actual = self.scalar(name,'SELECT VERSION()')
            assert actual.startswith(VERSION), actual
        return names

    def session(self,name):
        value = Session(self,name)
        self.sessions.append(value)
        return value

    def change(self,name,op,delta,user='writer'):
        assert re.fullmatch('[A-Z0-9_]+',op)
        return self.sql(name,'START TRANSACTION; UPDATE '+DB+'.account SET balance=balance+('
                        +str(delta)+') WHERE id=1; INSERT INTO '+DB+'.receipt VALUES ('
                        +quoted(op)+','+str(delta)+'); COMMIT;',user=user)

    def state(self,name):
        value = json.loads(self.sql(name,"SELECT JSON_OBJECT('balance',(SELECT balance FROM "+DB+".account WHERE id=1),"
            "'receipts',COALESCE((SELECT JSON_ARRAYAGG(JSON_OBJECT('id',op,'delta',delta)) FROM "+DB+".receipt),JSON_ARRAY()),"
            "'server_uuid',@@server_uuid,'executed',@@GLOBAL.gtid_executed)").stdout)
        value['receipts'].sort(key=lambda r:r['id'])
        return value

    def replication_status(self,name):
        lines = self.sql(name,'SHOW REPLICA STATUS',headings=True).stdout.strip('\n').splitlines()
        assert len(lines) == 2, 'Expected one replication channel'
        header,row = (line.split('\t') for line in lines)
        assert len(header) == len(row)
        status = dict(zip(header,row))
        fields = ['Replica_IO_Running','Replica_SQL_Running','Retrieved_Gtid_Set','Executed_Gtid_Set',
                  'Seconds_Behind_Source','Last_IO_Errno','Last_SQL_Errno','Auto_Position']
        return {field:status[field] for field in fields}

    def wait_gtid(self,name,target,seconds):
        assert 0 < seconds <= 30, 'zero means an unbounded wait in MySQL'
        return int(self.scalar(name,'SELECT WAIT_FOR_EXECUTED_GTID_SET('+quoted(target)+','+str(seconds)+')'))

    def cleanup(self):
        errors=[]
        for session in self.sessions:
            try: session.close()
            except Exception as error: errors.append(str(error))
        for container in reversed(self.containers):
            result=self.docker('rm','-f',container,check=False,timeout=30)
            if result.returncode: errors.append(result.stderr[-500:])
        for volume in reversed(self.volumes):
            result=self.docker('volume','rm',volume,check=False)
            if result.returncode: errors.append(result.stderr[-500:])
        if self.network:
            result=self.docker('network','rm',self.network,check=False)
            if result.returncode: errors.append(result.stderr[-500:])
        return errors


def oracle(state,expected):
    """Independent business check: exact operation set, deltas and base conservation."""
    actual={r['id']:r['delta'] for r in state['receipts']}
    assert len(actual)==len(state['receipts']) and actual==expected, (actual,expected)
    assert state['balance']==100+sum(expected.values()),state
    return {'balance':state['balance'],'receipt_ids':sorted(actual),'ledger_difference':state['balance']-100-sum(actual.values())}


def run(lab):
    source,replica=lab.setup()
    lab.sql(source,"CREATE USER 'repl'@'%' IDENTIFIED BY "+quoted(REPL_PASSWORD)+"; "
        "GRANT REPLICATION SLAVE ON *.* TO 'repl'@'%'; CREATE DATABASE "+DB+"; "
        "CREATE TABLE "+DB+".account(id INT PRIMARY KEY,balance INT NOT NULL) ENGINE=InnoDB; "
        "CREATE TABLE "+DB+".receipt(op VARCHAR(40) PRIMARY KEY,delta INT NOT NULL) ENGINE=InnoDB; "
        "INSERT INTO "+DB+".account VALUES (1,100); "
        "CREATE USER 'writer'@'%' IDENTIFIED BY "+quoted(WRITER_PASSWORD)+"; "
        "GRANT SELECT,INSERT,UPDATE ON "+DB+".* TO 'writer'@'%';")
    lab.sql(replica,"SET GLOBAL super_read_only=ON; CHANGE REPLICATION SOURCE TO SOURCE_HOST='source',"
        "SOURCE_USER='repl',SOURCE_PASSWORD="+quoted(REPL_PASSWORD)+",SOURCE_AUTO_POSITION=1,"
        "SOURCE_CONNECT_RETRY=1,SOURCE_RETRY_COUNT=20,SOURCE_GET_SOURCE_PUBLIC_KEY=1; START REPLICA;")
    initial_gtid=lab.scalar(source,'SELECT @@GLOBAL.gtid_executed')
    assert lab.wait_gtid(replica,initial_gtid,25)==0
    assert lab.state(replica)['balance']==100
    metadata={'image_requested':lab.image,'image':json.loads(lab.docker('image','inspect',lab.image).stdout)[0]['Id'],
              'repo_digests':json.loads(lab.docker('image','inspect',lab.image).stdout)[0].get('RepoDigests',[]),
              'source_version':lab.scalar(source,'SELECT VERSION()'),'replica_version':lab.scalar(replica,'SELECT VERSION()'),
              'source_uuid':lab.scalar(source,'SELECT @@server_uuid'),'replica_uuid':lab.scalar(replica,'SELECT @@server_uuid'),
              'python':platform.python_version(),'docker_server':lab.docker('version','--format','{{.Server.Version}}').stdout.strip()}

    # A real RR connection starts before the writer, but first reads after +10.
    rr=lab.session(source)
    rr.request('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ; START TRANSACTION')
    lab.change(source,'BEFORE_FIRST_READ',10)
    rr_first=rr.balance()
    lab.change(source,'AFTER_FIRST_READ',20)
    rr_second=rr.balance()
    rr.request('COMMIT')
    rr_fresh=rr.balance()
    assert [rr_first['balance'],rr_second['balance'],rr_fresh['balance']]==[110,110,130]
    assert rr_first['connection']==rr_second['connection']==rr_fresh['connection']
    rr.close()

    rc=lab.session(source)
    rc.request('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED; START TRANSACTION')
    rc_first=rc.balance()
    lab.change(source,'RC_UPDATE',5)
    rc_second=rc.balance()
    rc.request('COMMIT')
    assert [rc_first['balance'],rc_second['balance']]==[130,135]
    assert rc_first['connection']==rc_second['connection']
    rc.close()
    before_lag=lab.scalar(source,'SELECT @@GLOBAL.gtid_executed')
    assert lab.wait_gtid(replica,before_lag,25)==0

    # Receiver continues; applier is deliberately stopped before another commit.
    lab.sql(replica,'STOP REPLICA SQL_THREAD')
    lab.change(source,'RECEIVED_NOT_APPLIED',7)
    lag_target=lab.scalar(source,'SELECT @@GLOBAL.gtid_executed')
    deadline=time.monotonic()+25
    while True:
        status=lab.replication_status(replica)
        received=int(lab.scalar(replica,'SELECT GTID_SUBSET('+quoted(lag_target)+','+quoted(status['Retrieved_Gtid_Set'])+')'))
        if received==1: break
        assert time.monotonic()<deadline,'receiver never obtained source target'
        time.sleep(.2)
    lag_source,lag_replica=lab.state(source),lab.state(replica)
    applied=int(lab.scalar(replica,'SELECT GTID_SUBSET('+quoted(lag_target)+',@@GLOBAL.gtid_executed)'))
    premature_wait=lab.wait_gtid(replica,lag_target,1)
    assert status['Replica_IO_Running']=='Yes' and status['Replica_SQL_Running']=='No'
    assert status['Last_IO_Errno']=='0' and status['Last_SQL_Errno']=='0'
    assert [lag_source['balance'],lag_replica['balance'],received,applied,premature_wait]==[142,135,1,0,1]
    expected_before={'BEFORE_FIRST_READ':10,'AFTER_FIRST_READ':20,'RC_UPDATE':5}
    oracle(lag_replica,expected_before)
    expected_old=dict(expected_before,RECEIVED_NOT_APPLIED=7)
    oracle(lag_source,expected_old)

    lab.sql(replica,'START REPLICA SQL_THREAD')
    catchup_wait=lab.wait_gtid(replica,lag_target,25)
    assert catchup_wait==0
    caught_up=lab.state(replica)
    oracle(caught_up,expected_old)

    # A planned switch has a reachable old source and stops its writers first.
    lab.sql(source,"REVOKE INSERT,UPDATE ON "+DB+".* FROM 'writer'@'%'; SET GLOBAL super_read_only=ON;")
    denied=lab.sql(source,"INSERT INTO "+DB+".receipt VALUES ('OLD_WRITER',999)",user='writer',check=False)
    assert denied.returncode and re.search(r'ERROR (1142|1290)',denied.stderr),denied.stderr
    admin_denied=lab.sql(source,"INSERT INTO "+DB+".receipt VALUES ('OLD_ADMIN',999)",check=False)
    assert admin_denied.returncode and '1290' in admin_denied.stderr,admin_denied.stderr
    frozen_gtid=lab.scalar(source,'SELECT @@GLOBAL.gtid_executed')
    final_gate=lab.wait_gtid(replica,frozen_gtid,25)
    assert final_gate==0
    pre_switch_source=lab.state(source)
    pre_switch_replica=lab.state(replica)
    oracle(pre_switch_source,expected_old);oracle(pre_switch_replica,expected_old)
    assert pre_switch_source['receipts']==pre_switch_replica['receipts']
    lab.sql(replica,'STOP REPLICA; RESET REPLICA ALL;')
    lab.docker('stop','--time','15',source,timeout=25)
    old_running=json.loads(lab.docker('inspect',source).stdout)[0]['State']['Running']
    old_after_stop=lab.sql(source,"INSERT INTO "+DB+".receipt VALUES ('OLD_AFTER_STOP',999)",user='writer',check=False)
    assert old_running is False and old_after_stop.returncode!=0
    lab.sql(replica,"SET GLOBAL super_read_only=OFF; SET GLOBAL read_only=OFF; "
            "GRANT INSERT,UPDATE ON "+DB+".* TO 'writer'@'%';")
    lab.change(replica,'NEW_WRITER',3)
    final=lab.state(replica)
    final_oracle=oracle(final,dict(expected_old,NEW_WRITER=3))
    assert final['server_uuid']!=pre_switch_source['server_uuid']
    return {'environment':metadata,'initial':{'balance':100,'replica_wait':0},
            'read_views':{'rr':{'begin_before_update':True,'first':rr_first,'same_transaction':rr_second,'after_commit':rr_fresh},
                          'rc':{'first':rc_first,'same_transaction':rc_second}},
            'lag':{'source_target':lag_target,'status':status,'received_contains_target':received,
                   'executed_contains_target':applied,'wait_before_apply':premature_wait,
                   'source':lag_source,'replica':lag_replica,'promote_allowed':False},
            'caught_up':{'wait':catchup_wait,'replica':caught_up},
            'switchover':{'frozen_target':frozen_gtid,'wait':final_gate,'source_before_stop':pre_switch_source,
                          'replica_before_promotion':pre_switch_replica,'old_writer_error':re.search(r'ERROR (\d+)',denied.stderr).group(1),
                          'old_admin_error':'1290','old_container_running':old_running,
                          'old_stopped_write_exit':old_after_stop.returncode,'new_primary':final,'oracle':final_oracle},
            'scope':'real local two-server MySQL; controlled planned switch with old container stopped; no production HA, WAN, proxy or power-loss proof'}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image',default=IMAGE)
    parser.add_argument('--output','--report',dest='report',required=True)
    args=parser.parse_args()
    lab=Lab(args.image)
    started=time.monotonic()
    record={'schema':1,'status':'failed','source_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'verified_on':datetime.now(timezone.utc).date().isoformat()}
    error=None
    try:
        record['result']=run(lab)
        record['status']='passed'
    except Exception as caught:
        error=caught
        record['error']=str(caught)
    finally:
        try: record['cleanup_errors']=lab.cleanup()
        except Exception as caught: record['cleanup_errors']=[str(caught)]
        if record['cleanup_errors']:
            record['status']='failed'
            error=error or RuntimeError('owned resource cleanup did not complete')
        record['elapsed_seconds']=round(time.monotonic()-started,3)
        Path(args.report).parent.mkdir(parents=True,exist_ok=True)
        Path(args.report).write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
    if error: raise SystemExit(str(error))
    print(json.dumps({'status':record['status'],'report':args.report,'balance':record['result']['switchover']['oracle']['balance']}))


if __name__=='__main__':
    main()
