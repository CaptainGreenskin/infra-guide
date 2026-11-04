"""Maintainer: validate samples against pinned upstream schema, then run local lab."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import urllib.request
import zipfile
import yaml
import jsonschema

root = Path(__file__).resolve().parents[1]
folder = root / 'dist/labs/cloud-native'
schema_url = 'https://raw.githubusercontent.com/kubernetes/kubernetes/v1.34.0/api/openapi-spec/swagger.json'
cache = root.parent / 'kubernetes-v1.34.0-swagger.json'
if not cache.exists():
    with urllib.request.urlopen(schema_url, timeout=60) as response:
        cache.write_bytes(response.read())
schema = json.loads(cache.read_text())
# Kubernetes OpenAPI 2 uses its int-or-string format on a nominal string type.
# Honour that upstream wire type rather than rejecting valid numeric ports.
def normalise_int_or_string(node):
    if isinstance(node, dict):
        if node.get('format') == 'int-or-string':
            node['type'] = ['integer', 'string']
        for value in node.values():
            normalise_int_or_string(value)
    elif isinstance(node, list):
        for value in node:
            normalise_int_or_string(value)
normalise_int_or_string(schema)
resources = {}
for key, definition in schema['definitions'].items():
    for gvk in definition.get('x-kubernetes-group-version-kind', []):
        api_version = (gvk['group'] + '/' if gvk['group'] else '') + gvk['version']
        resources[(api_version, gvk['kind'])] = key
records = []
objects = []
for file in sorted(folder.glob('*.yaml')):
    for document in yaml.safe_load_all(file.read_text()):
        key = resources[(document['apiVersion'], document['kind'])]
        validation_schema = {'$ref': '#/definitions/' + key, 'definitions': schema['definitions']}
        jsonschema.Draft4Validator(validation_schema).validate(document)
        objects.append(document)
        records.append({'file': file.name, 'kind': document['kind'], 'name': document['metadata']['name']})

# Verify relationships that per-object OpenAPI does not establish.
by_kind = {obj['kind']: obj for obj in objects}
deployment = by_kind['Deployment']
container = deployment['spec']['template']['spec']['containers'][0]
labels = deployment['spec']['template']['metadata']['labels']
assert deployment['spec']['selector']['matchLabels'] == by_kind['Service']['spec']['selector'] == labels
assert by_kind['Service']['spec']['ports'][0]['targetPort'] == container['ports'][0]['name']
assert container['ports'][0]['containerPort'] == 8080
assert by_kind['HorizontalPodAutoscaler']['spec']['scaleTargetRef']['name'] == deployment['metadata']['name']
assert container['resources']['requests']['cpu'] == '200m'
assert by_kind['PodDisruptionBudget']['spec']['selector']['matchLabels'] == labels
assert all(container[key]['httpGet']['path'] in ('/healthz', '/readyz')
           for key in ('startupProbe', 'readinessProbe', 'livenessProbe'))
record = {
    'status': 'passed', 'schema_version': 'Kubernetes v1.34.0',
    'schema_url': schema_url, 'schema_sha256': hashlib.sha256(cache.read_bytes()).hexdigest(),
    'schema_adapter': 'int-or-string format accepts integer or string, as Kubernetes does',
    'scope': 'OpenAPI structural validation and sample cross-object relationships only. No cluster, admission, image pull, metrics, CNI or CSI execution.',
    'objects': records,
}
(folder / 'schema-check.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
run = subprocess.run([sys.executable, str(folder / 'verify.py')], text=True, capture_output=True, check=True)
(folder / 'validation.json').write_text(run.stdout)
with zipfile.ZipFile(root / 'dist/labs/cloud-native.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(folder.iterdir()):
        if file.is_file():
            archive.write(file, 'cloud-native/' + file.name)
print('PASS: 7 Kubernetes objects against v1.34.0 OpenAPI; relationships; local checks; Cloud ZIP.')
