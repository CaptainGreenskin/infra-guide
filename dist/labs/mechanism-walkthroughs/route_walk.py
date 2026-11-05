"""CIDR and longest-prefix teaching model. Does not configure a real VPC."""
import ipaddress
import json


def lookup(destination, routes):
    address = ipaddress.ip_address(destination)
    matches = [(ipaddress.ip_network(prefix), target) for prefix, target in routes
               if address.version == ipaddress.ip_network(prefix).version
               and address in ipaddress.ip_network(prefix)]
    matches.sort(key=lambda row: row[0].prefixlen, reverse=True)
    if not matches:
        return None
    # Equal-prefix source priorities are product-specific, outside this model.
    if len(matches) > 1 and matches[0][0].prefixlen == matches[1][0].prefixlen:
        raise ValueError('equal-prefix priority is not defined by this model')
    return {'prefix': str(matches[0][0]), 'target': matches[0][1],
            'matched': [str(net) for net, _ in matches]}


def main():
    routes = [('10.20.0.0/16', 'local'), ('10.30.8.0/24', 'peer'),
              ('0.0.0.0/0', 'nat')]
    network = ipaddress.ip_network('10.30.8.0/24')
    assert network.num_addresses == 256
    assert ipaddress.ip_address('10.30.8.42') in network
    assert ipaddress.ip_address('10.30.9.42') not in network
    peer = lookup('10.30.8.42', routes)
    assert peer['target'] == 'peer'
    assert lookup('10.30.8.42', list(reversed(routes))) == peer
    host = lookup('10.30.8.42', routes + [('10.30.8.42/32', 'inspection')])
    assert host['target'] == 'inspection'
    assert lookup('198.51.100.9', routes)['target'] == 'nat'
    assert lookup('198.51.100.9', routes[:2]) is None
    # A peer-side table needs its own return route to the client's subnet.
    missing_return = lookup('10.20.4.7', [('10.30.8.0/24', 'local')])
    fixed_return = lookup('10.20.4.7', [('10.30.8.0/24', 'local'),
                                     ('10.20.0.0/16', 'peer-back')])
    assert missing_return is None and fixed_return['target'] == 'peer-back'
    try:
        lookup('10.30.8.42', routes + [('10.30.8.0/24', 'other-peer')])
    except ValueError:
        equal_prefix_rejected = True
    else:
        raise AssertionError('ambiguous equal-prefix rule was silently accepted')
    request = ['10.20.4.7', 51000, '10.30.8.42', 443, 'TCP']
    response = [request[2], request[3], request[0], request[1], request[4]]
    assert response[3] == 51000
    print(json.dumps({'cidr': {'network': str(network), 'addresses': 256,
                              'first': str(network[0]), 'last': str(network[-1])},
                      'peer': peer, 'host_route': host,
                      'missing_return': missing_return, 'fixed_return': fixed_return,
                      'request_tuple': request, 'response_tuple': response,
                      'equal_prefix_rejected': equal_prefix_rejected}, indent=2))


if __name__ == '__main__':
    main()
