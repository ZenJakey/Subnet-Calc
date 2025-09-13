// Global variables
let subnetMap = {};
let subnetNotes = {};
let maxNetSize = 0;
let infoColumnCount = 5;
let noteTimeout;
let operatingMode = 'Standard';
let previousOperatingMode = 'Standard';
let urlVersion = '1';
let configVersion = '2';
let currentIPVersion = 'ipv4';
let nibbleSplitEnabled = false;

// Operating mode configurations
const netsizePatterns = {
    Standard: '^([12]?[0-9]|3[0-2])$',
    AZURE: '^([12]?[0-9])$',
    AWS: '^(1?[0-9]|2[0-8])$',
    OCI: '^([12]?[0-9]|30)$',
};

const minSubnetSizes = {
    Standard: 32,
    AZURE: 29,
    AWS: 28,
    OCI: 30,
};

// IPv6 specific configurations
const ipv6MinSubnetSizes = {
    Standard: 64,
    AZURE: 64,
    AWS: 64,
    OCI: 64,
};

// IPv6 nibble split minimum sizes (4 bits smaller than regular minimum)
const ipv6NibbleMinSubnetSizes = {
    Standard: 68,
    AZURE: 68,
    AWS: 68,
    OCI: 68,
};

// IPv4 Helper Functions
function ipv4ToInt(ip) {
    return ip.split('.').reduce(function(ipInt, octet) { 
        return (ipInt<<8) + parseInt(octet, 10);
    }, 0) >>> 0;
}

function intToIPv4(ipInt) {
    return ((ipInt>>>24) + '.' + (ipInt>>16 & 255) + '.' + (ipInt>>8 & 255) + '.' + (ipInt & 255));
}

function ipv4SubnetLastAddress(subnet, netSize) {
    return subnet + ipv4SubnetAddresses(netSize) - 1;
}

function ipv4SubnetAddresses(netSize) {
    return 2**(32-netSize);
}

function ipv4SubnetUsableFirst(network, netSize, operatingMode) {
    if (netSize < 31) {
        switch (operatingMode) {
            case 'AWS':
            case 'AZURE':
                return network + 4;
            case 'OCI':
                return network + 2;
            default:
                return network + 1;
        }            
    } else {
        return network;
    }
}

function ipv4SubnetUsableLast(network, netSize) {
    let last_address = ipv4SubnetLastAddress(network, netSize);
    if (netSize < 31) {
        return last_address - 1;
    } else {
        return last_address;
    }
}

function ipv4GetNetwork(networkInput, netSize) {
    let ipInt = ipv4ToInt(networkInput);
    netSize = parseInt(netSize);
    for (let i=31-netSize; i>=0; i--) {
        ipInt &= ~ 1<<i;
    }
    return intToIPv4(ipInt);
}

function ipv4SplitNetwork(networkInput, netSize) {
    let subnets = [networkInput + '/' + (netSize + 1)];
    let newSubnet = ipv4ToInt(networkInput) + 2**(32-netSize-1);
    subnets.push(intToIPv4(newSubnet) + '/' + (netSize + 1));
    return subnets;
}

// IPv6 Helper Functions
function ipv6ToBigInt(ip) {
    // Normalize IPv6 address
    let normalized = normalizeIPv6(ip);
    let parts = normalized.split(':');
    let result = BigInt(0);
    
    for (let i = 0; i < 8; i++) {
        result = result * BigInt(65536) + BigInt(parseInt(parts[i], 16));
    }
    return result;
}

function bigIntToIPv6(bigInt) {
    let result = [];
    for (let i = 0; i < 8; i++) {
        result.unshift((bigInt & BigInt(65535)).toString(16));
        bigInt = bigInt >> BigInt(16);
    }
    return result.join(':');
}

function normalizeIPv6(ip) {
    // Remove any trailing /XX
    let cleanIP = ip.split('/')[0];
    
    // Handle :: expansion
    if (cleanIP.includes('::')) {
        let parts = cleanIP.split('::');
        let leftParts = parts[0] ? parts[0].split(':') : [];
        let rightParts = parts[1] ? parts[1].split(':') : [];
        
        let missingParts = 8 - leftParts.length - rightParts.length;
        let expanded = leftParts.concat(Array(missingParts).fill('0'), rightParts);
        cleanIP = expanded.join(':');
    } else {
        let parts = cleanIP.split(':');
        if (parts.length < 8) {
            // Pad with zeros
            while (parts.length < 8) {
                parts.push('0');
            }
        }
        cleanIP = parts.join(':');
    }
    
    return cleanIP;
}

function ipv6SubnetLastAddress(subnet, netSize) {
    return subnet + ipv6SubnetAddresses(netSize) - BigInt(1);
}

function ipv6SubnetAddresses(netSize) {
    return BigInt(2) ** BigInt(128 - netSize);
}

function ipv6SubnetUsableFirst(network, netSize, operatingMode) {
    // IPv6 typically reserves the first address (network address)
    // and the last address (broadcast/multicast)
    return network + BigInt(1);
}

function ipv6SubnetUsableLast(network, netSize) {
    let last_address = ipv6SubnetLastAddress(network, netSize);
    return last_address - BigInt(1);
}

function ipv6GetNetwork(networkInput, netSize) {
    let ipBigInt = ipv6ToBigInt(networkInput);
    netSize = parseInt(netSize);
    let mask = BigInt(2) ** BigInt(128 - netSize) - BigInt(1);
    mask = ~mask;
    return bigIntToIPv6(ipBigInt & mask);
}

function ipv6SplitNetwork(networkInput, netSize) {
    let subnets = [networkInput + '/' + (netSize + 1)];
    let newSubnet = ipv6ToBigInt(networkInput) + (BigInt(2) ** BigInt(128 - netSize - 1));
    subnets.push(bigIntToIPv6(newSubnet) + '/' + (netSize + 1));
    return subnets;
}

function ipv6SplitNetworkNibble(networkInput, netSize) {
    // Split by 4-bit increments (nibbles) instead of single bits
    let nibbleIncrement = 4;
    let newNetSize = netSize + nibbleIncrement;
    
    // Create 16 subnets (2^4 = 16) for each nibble split
    let subnets = [];
    let baseAddress = ipv6ToBigInt(networkInput);
    let subnetSize = BigInt(2) ** BigInt(128 - newNetSize);
    
    for (let i = 0; i < 16; i++) {
        let subnetAddress = baseAddress + (BigInt(i) * subnetSize);
        subnets.push(bigIntToIPv6(subnetAddress) + '/' + newNetSize);
    }
    
    return subnets;
}

// IPv6 validation function
function isValidIPv6(ip) {
    // Remove any trailing /XX
    let cleanIP = ip.split('/')[0];
    
    // Handle special cases
    if (cleanIP === '::') return true;
    if (cleanIP === '::1') return true;
    
    // Check for invalid characters
    if (!/^[0-9a-fA-F:]+$/.test(cleanIP)) return false;
    
    // Count colons
    let colonCount = (cleanIP.match(/:/g) || []).length;
    
    // Check for invalid colon patterns
    if (cleanIP.includes(':::')) return false;
    if (cleanIP.startsWith(':') && !cleanIP.startsWith('::')) return false;
    if (cleanIP.endsWith(':') && !cleanIP.endsWith('::')) return false;
    
    // Handle :: expansion
    if (cleanIP.includes('::')) {
        if ((cleanIP.match(/::/g) || []).length > 1) return false; // Only one :: allowed
        
        let parts = cleanIP.split('::');
        let leftParts = parts[0] ? parts[0].split(':') : [];
        let rightParts = parts[1] ? parts[1].split(':') : [];
        
        // Remove empty parts
        leftParts = leftParts.filter(p => p !== '');
        rightParts = rightParts.filter(p => p !== '');
        
        // Check individual parts
        for (let part of leftParts.concat(rightParts)) {
            if (part.length > 4) return false;
            if (!/^[0-9a-fA-F]+$/.test(part)) return false;
        }
        
        // Total parts should not exceed 8
        if (leftParts.length + rightParts.length > 7) return false;
        
        return true;
    } else {
        // No :: expansion
        let parts = cleanIP.split(':');
        if (parts.length !== 8) return false;
        
        // Check each part
        for (let part of parts) {
            if (part.length === 0 || part.length > 4) return false;
            if (!/^[0-9a-fA-F]+$/.test(part)) return false;
        }
        
        return true;
    }
}

// Format IPv6 address for display
function formatIPv6(ip) {
    // Compress the longest sequence of zeros
    let parts = ip.split(':');
    let maxZeros = 0;
    let maxZerosStart = -1;
    let currentZeros = 0;
    let currentStart = -1;
    
    for (let i = 0; i < parts.length; i++) {
        if (parts[i] === '0' || parts[i] === '') {
            if (currentZeros === 0) currentStart = i;
            currentZeros++;
        } else {
            if (currentZeros > maxZeros) {
                maxZeros = currentZeros;
                maxZerosStart = currentStart;
            }
            currentZeros = 0;
        }
    }
    
    if (currentZeros > maxZeros) {
        maxZeros = currentZeros;
        maxZerosStart = currentStart;
    }
    
    if (maxZeros > 1) {
        let left = parts.slice(0, maxZerosStart).join(':');
        let right = parts.slice(maxZerosStart + maxZeros).join(':');
        if (left && right) {
            return left + '::' + right;
        } else if (left) {
            return left + '::';
        } else if (right) {
            return '::' + right;
        } else {
            return '::';
        }
    }
    
    return ip;
}

// DOM Helper Functions
function $(selector) {
    return document.querySelector(selector);
}

function $$(selector) {
    return document.querySelectorAll(selector);
}

function addEvent(element, event, handler) {
    if (element.addEventListener) {
        element.addEventListener(event, handler);
    } else if (element.attachEvent) {
        element.attachEvent('on' + event, handler);
    }
}

// Main Functions
function reset() {
    set_usable_ips_title(operatingMode);
    
    let networkInput, netSizeInput;
    if (currentIPVersion === 'ipv4') {
        networkInput = $('#network_ipv4').value;
        netSizeInput = $('#netsize').value;
    } else {
        networkInput = $('#network_ipv6').value;
        netSizeInput = $('#netsize').value;
    }
    
    let cidrInput = networkInput + '/' + netSizeInput;
    let rootNetwork, rootCidr;
    
    if (currentIPVersion === 'ipv4') {
        rootNetwork = ipv4GetNetwork(networkInput, netSizeInput);
        rootCidr = rootNetwork + '/' + netSizeInput;
    } else {
        rootNetwork = ipv6GetNetwork(networkInput, netSizeInput);
        rootCidr = rootNetwork + '/' + netSizeInput;
    }
    
    // Check if the network was actually changed (not just normalized)
    let networkChanged = false;
    if (currentIPVersion === 'ipv4') {
        networkChanged = (networkInput !== rootNetwork);
    } else {
        // For IPv6, compare normalized versions to avoid false positives
        let normalizedInput = normalizeIPv6(networkInput);
        let normalizedRoot = normalizeIPv6(rootNetwork);
        networkChanged = (normalizedInput !== normalizedRoot);
    }
    
    if (networkChanged) {
        show_warning_modal('<div>Your network input is not on a network boundary for this network size. It has been automatically changed:</div><div class="font-monospace pt-2">' + networkInput + ' -> ' + rootNetwork + '</div>');
        if (currentIPVersion === 'ipv4') {
            $('#network_ipv4').value = rootNetwork;
        } else {
            $('#network_ipv6').value = rootNetwork;
        }
        cidrInput = rootCidr;
    }
    
    if (Object.keys(subnetMap).length > 0) {
        if (isMatchingSize(Object.keys(subnetMap)[0], cidrInput)) {
            subnetMap = changeBaseNetwork(cidrInput);
        } else {
            subnetMap = {};
            subnetMap[rootCidr] = {};
        }
    } else {
        subnetMap[rootCidr] = {};
    }
    
    maxNetSize = parseInt(netSizeInput);
    renderTable(operatingMode);
}

function changeBaseNetwork(newBaseNetwork) {
    let miniSubnetMap = {};
    minifySubnetMap(miniSubnetMap, subnetMap, Object.keys(subnetMap)[0]);
    let newSubnetMap = {};
    expandSubnetMap(newSubnetMap, miniSubnetMap, newBaseNetwork);
    return newSubnetMap;
}

function isMatchingSize(subnet1, subnet2) {
    return subnet1.split('/')[1] === subnet2.split('/')[1];
}

function renderTable(operatingMode) {
    const calcbody = document.getElementById('calcbody');
    
    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();
    let maxDepth = get_dict_max_depth(subnetMap, 0);
    addRowTreeToFragment(subnetMap, 0, maxDepth, operatingMode, fragment);
    
    // Replace all content at once to minimize layout thrashing
    calcbody.innerHTML = '';
    calcbody.appendChild(fragment);
}

function addRowTree(subnetTree, depth, maxDepth, operatingMode) {
    const fragment = document.createDocumentFragment();
    addRowTreeToFragment(subnetTree, depth, maxDepth, operatingMode, fragment);
    document.getElementById('calcbody').appendChild(fragment);
}

function addRowTreeToFragment(subnetTree, depth, maxDepth, operatingMode, fragment) {
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) { continue; }
        if (has_network_sub_keys(subnetTree[mapKey])) {
            addRowTreeToFragment(subnetTree[mapKey], depth + 1, maxDepth, operatingMode, fragment);
        } else {
            let subnet_split = mapKey.split('/');
            let notesWidth = '30%';
            if ((maxDepth > 5) && (maxDepth <= 10)) {
                notesWidth = '25%';
            } else if ((maxDepth > 10) && (maxDepth <= 15)) {
                notesWidth = '20%';
            } else if ((maxDepth > 15) && (maxDepth <= 20)) {
                notesWidth = '15%';
            } else if (maxDepth > 20) {
                notesWidth = '10%';
            }
            let rowElement = createRowElement(subnet_split[0], parseInt(subnet_split[1]), (infoColumnCount + maxDepth - depth), (subnetTree[mapKey]['_note'] || ''), notesWidth, operatingMode);
            fragment.appendChild(rowElement);
        }
    }
}

function createRowElement(network, netSize, colspan, note, notesWidth, operatingMode) {
    let addressFirst, addressLast, usableFirst, usableLast, hostCount, rangeCol, usableCol;
    
    if (currentIPVersion === 'ipv4') {
        addressFirst = ipv4ToInt(network);
        addressLast = ipv4SubnetLastAddress(addressFirst, netSize);
        usableFirst = ipv4SubnetUsableFirst(addressFirst, netSize, operatingMode);
        usableLast = ipv4SubnetUsableLast(addressFirst, netSize);
        hostCount = 1 + usableLast - usableFirst;
        
        if (netSize < 32) {
            rangeCol = intToIPv4(addressFirst) + ' - ' + intToIPv4(addressLast);
            usableCol = intToIPv4(usableFirst) + ' - ' + intToIPv4(usableLast);
        } else {
            rangeCol = intToIPv4(addressFirst);
            usableCol = intToIPv4(usableFirst);
        }
    } else {
        addressFirst = ipv6ToBigInt(network);
        addressLast = ipv6SubnetLastAddress(addressFirst, netSize);
        usableFirst = ipv6SubnetUsableFirst(addressFirst, netSize, operatingMode);
        usableLast = ipv6SubnetUsableLast(addressFirst, netSize);
        hostCount = Number(usableLast - usableFirst + BigInt(1));
        
        if (netSize < 128) {
            rangeCol = formatIPv6(bigIntToIPv6(addressFirst)) + ' - ' + formatIPv6(bigIntToIPv6(addressLast));
            usableCol = formatIPv6(bigIntToIPv6(usableFirst)) + ' - ' + formatIPv6(bigIntToIPv6(usableLast));
        } else {
            rangeCol = formatIPv6(bigIntToIPv6(addressFirst));
            usableCol = formatIPv6(bigIntToIPv6(usableFirst));
        }
    }
    
    // Format host count based on IP version
    let formattedHostCount;
    if (currentIPVersion === 'ipv4') {
        formattedHostCount = hostCount.toLocaleString();
    } else {
        // Use scientific notation for IPv6
        formattedHostCount = hostCount.toExponential(2);
    }
    
    let rowId = 'row_' + network.replace(/[.:]/g, '-') + '_' + netSize;
    let rowCIDR = network + '/' + netSize;
    
    // Create row element
    let row = document.createElement('tr');
    row.id = rowId;
    row.setAttribute('aria-label', rowCIDR);
    
    // Create cells
    let cells = [
        createCell('td', rowCIDR, 'row_address', rowId, 'subnetHeader'),
        createCell('td', rangeCol, 'row_range', rowId, 'rangeHeader'),
        createCell('td', usableCol, 'row_usable', rowId, 'useableHeader'),
        createCell('td', formattedHostCount, 'row_hosts', rowId, 'hostsHeader'),
        createNoteCell(note, notesWidth, rowId, rowCIDR),
        createSplitCell(rowCIDR, colspan, netSize, rowId)
    ];
    
    cells.forEach(cell => row.appendChild(cell));
    
    // Add join cells if needed
    if (netSize > maxNetSize) {
        let matchingNetworkList = get_matching_network_list(network, subnetMap).slice(1);
        for (const i in matchingNetworkList) {
            let matchingNetwork = matchingNetworkList[i];
            let networkChildrenCount = count_network_children(matchingNetwork, subnetMap, []);
            let joinCell = createJoinCell(matchingNetwork, networkChildrenCount);
            row.appendChild(joinCell);
        }
    }
    
    return row;
}

function createCell(tag, content, className, rowId, headerId) {
    let cell = document.createElement(tag);
    cell.className = className;
    cell.textContent = content;
    cell.setAttribute('data-subnet', content.includes('/') ? content : '');
    cell.setAttribute('aria-labelledby', rowId + ' ' + headerId);
    return cell;
}

function createNoteCell(note, notesWidth, rowId, rowCIDR) {
    let cell = document.createElement('td');
    cell.className = 'note';
    cell.style.width = notesWidth;
    
    let label = document.createElement('label');
    let input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control shadow-none p-0';
    input.setAttribute('data-subnet', rowCIDR);
    input.setAttribute('aria-labelledby', rowId + ' noteHeader');
    input.value = note;
    
    label.appendChild(input);
    cell.appendChild(label);
    return cell;
}

function createSplitCell(rowCIDR, colspan, netSize, rowId) {
    let cell = document.createElement('td');
    cell.className = 'split rotate';
    cell.setAttribute('data-subnet', rowCIDR);
    cell.setAttribute('data-mutate-verb', 'split');
    cell.setAttribute('aria-labelledby', rowId + ' splitHeader');
    cell.setAttribute('rowspan', '1');
    cell.setAttribute('colspan', colspan);
    
    let span = document.createElement('span');
    span.textContent = '/' + netSize;
    cell.appendChild(span);
    
    return cell;
}

function createJoinCell(matchingNetwork, networkChildrenCount) {
    let cell = document.createElement('td');
    cell.className = 'join rotate';
    cell.setAttribute('data-subnet', matchingNetwork);
    cell.setAttribute('data-mutate-verb', 'join');
    cell.setAttribute('aria-label', matchingNetwork + ' Join');
    cell.setAttribute('rowspan', networkChildrenCount);
    cell.setAttribute('colspan', '1');
    
    let span = document.createElement('span');
    span.textContent = '/' + matchingNetwork.split('/')[1];
    cell.appendChild(span);
    
    return cell;
}

// Helper Functions
function get_dict_max_depth(dict, curDepth) {
    let maxDepth = curDepth;
    for (let mapKey in dict) {
        if (mapKey.startsWith('_')) { continue; }
        let newDepth = get_dict_max_depth(dict[mapKey], curDepth + 1);
        if (newDepth > maxDepth) { maxDepth = newDepth; }
    }
    return maxDepth;
}

function has_network_sub_keys(dict) {
    let allKeys = Object.keys(dict);
    for (let i in allKeys) {
        if (!allKeys[i].startsWith('_') && allKeys[i] !== 'n' && allKeys[i] !== 'c') {
            return true;
        }
    }
    return false;
}

function count_network_children(network, subnetTree, ancestryList) {
    let childCount = 0;
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) { continue; }
        if (has_network_sub_keys(subnetTree[mapKey])) {
            childCount += count_network_children(network, subnetTree[mapKey], ancestryList.concat([mapKey]));
        } else {
            if (ancestryList.includes(network)) {
                childCount += 1;
            }
        }
    }
    return childCount;
}

function get_matching_network_list(network, subnetTree) {
    let subnetList = [];
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) { continue; }
        if (has_network_sub_keys(subnetTree[mapKey])) {
            subnetList.push.apply(subnetList, get_matching_network_list(network, subnetTree[mapKey]));
        }
        if (mapKey.split('/')[0] === network) {
            subnetList.push(mapKey);
        }
    }
    return subnetList;
}

function get_consolidated_property(subnetTree, property) {
    let allValues = get_property_values(subnetTree, property);
    let allValuesMatch = allValues.every( (val, i, arr) => val === arr[0] );
    if (allValuesMatch) {
        return allValues[0];
    } else {
        return '';
    }
}

function get_property_values(subnetTree, property) {
    let propValues = [];
    for (let mapKey in subnetTree) {
        if (has_network_sub_keys(subnetTree[mapKey])) {
            propValues.push.apply(propValues, get_property_values(subnetTree[mapKey], property));
        } else {
            propValues.push(subnetTree[mapKey][property] || '');
        }
    }
    return propValues;
}

function mutate_subnet_map(verb, network, subnetTree, propValue = '') {
    if (subnetTree === '') { subnetTree = subnetMap; }
    
    // Find the target network in the tree
    let targetNode = findNetworkInTree(subnetTree, network);
    if (!targetNode) {
        console.log('Network not found:', network);
        return;
    }
    
    let netSplit = network.split('/');
    let netSize = parseInt(netSplit[1]);
    
    if (verb === 'split') {
        let minSize;
        if (currentIPVersion === 'ipv4') {
            minSize = minSubnetSizes[operatingMode];
        } else {
            // Use nibble minimum size if nibble split is enabled
            minSize = nibbleSplitEnabled ? ipv6NibbleMinSubnetSizes[operatingMode] : ipv6MinSubnetSizes[operatingMode];
        }
        
        if (netSize < minSize) {
            let new_networks;
            if (currentIPVersion === 'ipv4') {
                new_networks = ipv4SplitNetwork(netSplit[0], netSize);
            } else {
                // Check if nibble split is enabled for IPv6
                if (nibbleSplitEnabled) {
                    new_networks = ipv6SplitNetworkNibble(netSplit[0], netSize);
                } else {
                    new_networks = ipv6SplitNetwork(netSplit[0], netSize);
                }
            }
            
            // Clear the current node and add children
            Object.keys(targetNode).forEach(key => {
                if (!key.startsWith('_')) {
                    delete targetNode[key];
                }
            });
            
            // Add all new networks (2 for regular split, 16 for nibble split)
            new_networks.forEach(network => {
                targetNode[network] = {};
            });
            
            // Copy properties to children
            if (targetNode.hasOwnProperty('_note')) {
                new_networks.forEach(network => {
                    targetNode[network]['_note'] = targetNode['_note'];
                });
                delete targetNode['_note'];
            }
        } else {
            let modal_error_message = 'The minimum ' + currentIPVersion.toUpperCase() + ' subnet size for ' + operatingMode + ' is /' + minSize + '.';
            show_warning_modal('<div>' + modal_error_message + '</div>');
        }
    } else if (verb === 'join') {
        // Get all child networks
        let childNetworks = Object.keys(targetNode).filter(key => !key.startsWith('_'));
        
        if (childNetworks.length >= 2) {
            // Consolidate properties from children
            let consolidatedNote = get_consolidated_property(targetNode, '_note');
            
            // Clear all children
            childNetworks.forEach(child => {
                delete targetNode[child];
            });
            
            // Set consolidated properties
            targetNode['_note'] = consolidatedNote;
        }
    } else if (verb === 'note') {
        targetNode['_note'] = propValue;
    }
}

function findNetworkInTree(tree, network) {
    for (let key in tree) {
        if (key === network) {
            return tree[key];
        }
        if (typeof tree[key] === 'object' && !key.startsWith('_')) {
            let found = findNetworkInTree(tree[key], network);
            if (found) return found;
        }
    }
    return null;
}

function switchMode(operatingMode) {
    let isSwitched = true;
    
    if (subnetMap !== null) {
        let minSize;
        if (currentIPVersion === 'ipv4') {
            minSize = minSubnetSizes[operatingMode];
        } else {
            // Use nibble minimum size if nibble split is enabled
            minSize = nibbleSplitEnabled ? ipv6NibbleMinSubnetSizes[operatingMode] : ipv6MinSubnetSizes[operatingMode];
        }
        
        if (validateSubnetSizes(subnetMap, minSize)) {
            renderTable(operatingMode);
            set_usable_ips_title(operatingMode);
            isSwitched = true;
        } else {
            let modal_error_message = 'One or more subnets are smaller than the minimum allowed for ' + operatingMode + '.<br/>The smallest size allowed is /' + minSize + '.';
            show_warning_modal('<div>' + modal_error_message + '</div>');
            isSwitched = false;
        }
    } else {
        reset();
    }
    
    return isSwitched;
}

function validateSubnetSizes(subnetMap, minSubnetSize) {
    let isValid = true;
    const validate = (subnetTree) => {
        for (let key in subnetTree) {
            if (key.startsWith('_')) continue;
            let [_, size] = key.split('/');
            if (parseInt(size) > minSubnetSize) {
                isValid = false;
                return;
            }
            if (typeof subnetTree[key] === 'object') {
                validate(subnetTree[key]);
            }
        }
    };
    validate(subnetMap);
    return isValid;
}

function set_usable_ips_title(operatingMode) {
    switch (operatingMode) {
        case 'AWS':
            $('#useableHeader').innerHTML = 'Usable IPs (<a href="https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html#subnet-sizing-ipv4" target="_blank" rel="noopener noreferrer" style="color:#000; border-bottom: 1px dotted #000; text-decoration: dotted" title="AWS reserves 5 addresses in each subnet for platform use.">AWS</a>)';
            break;
        case 'AZURE':
            $('#useableHeader').innerHTML = 'Usable IPs (<a href="https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq#are-there-any-restrictions-on-using-ip-addresses-within-these-subnets" target="_blank" rel="noopener noreferrer" style="color:#000; border-bottom: 1px dotted #000; text-decoration: dotted" title="Azure reserves 5 addresses in each subnet for platform use.">Azure</a>)';
            break;
        case 'OCI':
            $('#useableHeader').innerHTML = 'Usable IPs (<a href="https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/overview.htm#Reserved__reserved_subnet" target="_blank" rel="noopener noreferrer" style="color:#000; border-bottom: 1px dotted #000; text-decoration: dotted" title="OCI reserves 3 addresses in each subnet for platform use.">OCI</a>)';
            break;
        default:
            $('#useableHeader').innerHTML = 'Usable IPs';
            break;
    }
}

function show_warning_modal(message) {
    $('#notifyModalDescription').innerHTML = message;
    let modal = new bootstrap.Modal(document.getElementById('notifyModal'));
    modal.show();
}

// Export/Import Functions
function exportConfig(isMinified = true) {
    const baseNetwork = Object.keys(subnetMap)[0];
    let miniSubnetMap = {};
    subnetMap = sortIPCIDRs(subnetMap);
    if (isMinified) {
        minifySubnetMap(miniSubnetMap, subnetMap, baseNetwork);
    }
    
    let config = {
        'config_version': configVersion,
        'ip_version': currentIPVersion,
        'base_network': baseNetwork,
        'subnets': isMinified ? miniSubnetMap : subnetMap,
    };
    
    // Add operating mode if not Standard
    if (operatingMode !== 'Standard') {
        config['operating_mode'] = operatingMode;
    }
    
    // Add nibble split state if enabled
    if (nibbleSplitEnabled) {
        config['nibble_split'] = nibbleSplitEnabled;
    }
    
    return config;
}

function getConfigUrl() {
    let defaultExport = JSON.parse(JSON.stringify(exportConfig(true)));
    renameKey(defaultExport, 'config_version', 'v');
    renameKey(defaultExport, 'ip_version', 'i');
    renameKey(defaultExport, 'base_network', 'b');
    if (defaultExport.hasOwnProperty('operating_mode')) {
        renameKey(defaultExport, 'operating_mode', 'm');
    }
    if (defaultExport.hasOwnProperty('nibble_split')) {
        renameKey(defaultExport, 'nibble_split', 'n');
    }
    renameKey(defaultExport, 'subnets', 's');
    return '/index.html?c=' + urlVersion + encodeURIComponent(JSON.stringify(defaultExport));
}

function processConfigUrl() {
    const params = new Proxy(new URLSearchParams(window.location.search), {
        get: (searchParams, prop) => searchParams.get(prop),
    });
    if (params['c'] !== null) {
        try {
            // First character is the version of the URL string, in case the mechanism of encoding changes
            let urlVersion = params['c'].substring(0, 1);
            let urlData = params['c'].substring(1);
            let urlConfig = JSON.parse(decodeURIComponent(urlData));
            
            // Rename keys back to full names
            renameKey(urlConfig, 'v', 'config_version');
            if (urlConfig.hasOwnProperty('m')) {
                renameKey(urlConfig, 'm', 'operating_mode');
            }
            if (urlConfig.hasOwnProperty('n')) {
                renameKey(urlConfig, 'n', 'nibble_split');
            }
            renameKey(urlConfig, 'i', 'ip_version');
            renameKey(urlConfig, 'b', 'base_network');
            renameKey(urlConfig, 's', 'subnets');
            
            if (urlConfig['config_version'] === '1') {
                // Version 1 Configs used full subnet strings as keys and just shortened the _note->_n and _color->_c keys
                expandKeys(urlConfig['subnets']);
            } else if (urlConfig['config_version'] === '2') {
                // Version 2 Configs uses the Nth Position representation for subnet keys and requires the base_network
                let expandedSubnetMap = {};
                expandSubnetMap(expandedSubnetMap, urlConfig['subnets'], urlConfig['base_network']);
                urlConfig['subnets'] = expandedSubnetMap;
            }
            
            importConfig(urlConfig);
            return true;
        } catch (e) {
            console.error('Error processing config URL:', e);
            return false;
        }
    }
    return false;
}

function expandKeys(subnetTree) {
    for (let key in subnetTree) {
        if (key === 'n' || key === 'c') {
            continue;
        }
        if (typeof subnetTree[key] === 'object') {
            expandKeys(subnetTree[key]);
        } else {
            if (subnetTree[key].hasOwnProperty('n')) {
                subnetTree[key]['_note'] = subnetTree[key]['n'];
                delete subnetTree[key]['n'];
            }
            if (subnetTree[key].hasOwnProperty('c')) {
                subnetTree[key]['_color'] = subnetTree[key]['c'];
                delete subnetTree[key]['c'];
            }
        }
    }
}

function importConfig(text) {
    if (text['config_version'] === '1') {
        var [subnetNet, subnetSize] = Object.keys(text['subnets'])[0].split('/');
    } else if (text['config_version'] === '2') {
        var [subnetNet, subnetSize] = text['base_network'].split('/');
    }
    
    // Set IP version first
    if (text['ip_version']) {
        currentIPVersion = text['ip_version'];
        document.querySelector('input[name="ip_version"][value="' + currentIPVersion + '"]').checked = true;
        
        // Update UI elements for IP version without triggering the change event
        if (currentIPVersion === 'ipv4') {
            document.getElementById('ipv4_inputs').classList.remove('d-none');
            document.getElementById('ipv6_inputs').classList.add('d-none');
            document.getElementById('network_ipv4').required = true;
            document.getElementById('network_ipv6').required = false;
            document.getElementById('netsize').pattern = '^([0-9]|[12][0-9]|3[0-2])$';
            document.getElementById('netsize').max = '32';
        } else {
            document.getElementById('ipv4_inputs').classList.add('d-none');
            document.getElementById('ipv6_inputs').classList.remove('d-none');
            document.getElementById('network_ipv4').required = false;
            document.getElementById('network_ipv6').required = true;
            document.getElementById('netsize').pattern = '^([0-9]|[1-9][0-9]|1[0-2][0-8])$';
            document.getElementById('netsize').max = '128';
        }
    }
    
    if (currentIPVersion === 'ipv4') {
        $('#network_ipv4').value = subnetNet;
    } else {
        $('#network_ipv6').value = subnetNet;
    }
    $('#netsize').value = subnetSize;
    maxNetSize = subnetSize;
    subnetMap = sortIPCIDRs(text['subnets']);
    operatingMode = text['operating_mode'] || 'Standard';
    
    // Set nibble split state if present
    if (text['nibble_split'] !== undefined) {
        nibbleSplitEnabled = text['nibble_split'];
        document.getElementById('nibble_split').checked = nibbleSplitEnabled;
    }
    
    switchMode(operatingMode);
}

function minifySubnetMap(minifiedMap, referenceMap, baseNetwork) {
    for (let subnet in referenceMap) {
        if (subnet.startsWith('_')) continue;
        
        minifiedMap[subnet] = {};
        if (referenceMap[subnet].hasOwnProperty('_note')) {
            minifiedMap[subnet]['n'] = referenceMap[subnet]['_note'];
        }
        if (Object.keys(referenceMap[subnet]).some(key => !key.startsWith('_'))) {
            minifySubnetMap(minifiedMap[subnet], referenceMap[subnet], baseNetwork);
        }
    }
}

function expandSubnetMap(expandedMap, miniMap, baseNetwork) {
    for (let mapKey in miniMap) {
        if (mapKey === 'n' || mapKey === 'c') {
            continue;
        }
        expandedMap[mapKey] = {};
        if (has_network_sub_keys(miniMap[mapKey])) {
            expandSubnetMap(expandedMap[mapKey], miniMap[mapKey], baseNetwork);
        } else {
            if (miniMap[mapKey].hasOwnProperty('n')) {
                expandedMap[mapKey]['_note'] = miniMap[mapKey]['n'];
            }
        }
    }
}

function renameKey(obj, oldKey, newKey) {
    if (oldKey !== newKey) {
        Object.defineProperty(obj, newKey, Object.getOwnPropertyDescriptor(obj, oldKey));
        delete obj[oldKey];
    }
}

function sortIPCIDRs(obj) {
    if (typeof obj === 'object' && Object.keys(obj).length === 0) {
        return {};
    }
    
    const entries = Object.entries(obj);
    const cidrEntries = entries.filter(([key]) => !key.startsWith('_'));
    const metadataEntries = entries.filter(([key]) => key.startsWith('_'));
    
    const sortedCIDREntries = cidrEntries.sort((a, b) => {
        if (currentIPVersion === 'ipv4') {
            const ipA = a[0].split('/')[0].split('.').map(Number);
            const ipB = b[0].split('/')[0].split('.').map(Number);
            
            for (let i = 0; i < 4; i++) {
                if (ipA[i] !== ipB[i]) {
                    return ipA[i] - ipB[i];
                }
            }
        } else {
            // For IPv6, convert to BigInt for comparison
            const ipA = ipv6ToBigInt(a[0].split('/')[0]);
            const ipB = ipv6ToBigInt(b[0].split('/')[0]);
            return ipA < ipB ? -1 : ipA > ipB ? 1 : 0;
        }
        return 0;
    });
    
    const sortedObj = {};
    
    for (const [key, value] of sortedCIDREntries) {
        sortedObj[key] = typeof value === 'object' ? sortIPCIDRs(value) : value;
    }
    
    for (const [key, value] of metadataEntries) {
        sortedObj[key] = value;
    }
    
    return sortedObj;
}

// Event Handlers
document.addEventListener('DOMContentLoaded', function() {
    // IP Version Toggle
    document.querySelectorAll('input[name="ip_version"]').forEach(function(radio) {
        radio.addEventListener('change', function() {
            currentIPVersion = this.value;
            if (currentIPVersion === 'ipv4') {
                document.getElementById('ipv4_inputs').classList.remove('d-none');
                document.getElementById('ipv6_inputs').classList.add('d-none');
                document.getElementById('network_ipv4').required = true;
                document.getElementById('network_ipv6').required = false;
                document.getElementById('netsize').pattern = '^([0-9]|[12][0-9]|3[0-2])$';
                document.getElementById('netsize').max = '32';
            } else {
                document.getElementById('ipv4_inputs').classList.add('d-none');
                document.getElementById('ipv6_inputs').classList.remove('d-none');
                document.getElementById('network_ipv4').required = false;
                document.getElementById('network_ipv6').required = true;
                document.getElementById('netsize').pattern = '^([0-9]|[1-9][0-9]|1[0-2][0-8])$';
                document.getElementById('netsize').max = '128';
            }
            
            // Clear the subnet map and reset the table when switching IP versions
            subnetMap = {};
            document.getElementById('calcbody').innerHTML = '<tr><td colspan="5" class="text-center text-muted">Enter a network address and click Go to start subnetting</td></tr>';
            document.getElementById('input_form').classList.remove('was-validated');
        });
    });

    // Nibble Split Toggle
    document.getElementById('nibble_split').addEventListener('change', function() {
        nibbleSplitEnabled = this.checked;
        
        // Clear the subnet map and reset the table when toggling nibble split
        if (currentIPVersion === 'ipv6' && Object.keys(subnetMap).length > 0) {
            subnetMap = {};
            document.getElementById('calcbody').innerHTML = '<tr><td colspan="5" class="text-center text-muted">Enter a network address and click Go to start subnetting</td></tr>';
            document.getElementById('input_form').classList.remove('was-validated');
        }
    });

    // Paste handling for IPv4
    document.getElementById('network_ipv4').addEventListener('paste', function (e) {
        let pastedData = e.clipboardData.getData('text');
        if (pastedData.includes('/')) {
            let [network, netSize] = pastedData.split('/');
            document.getElementById('network_ipv4').value = network;
            document.getElementById('netsize').value = netSize;
        }
        e.preventDefault();
    });

    // Paste handling for IPv6
    document.getElementById('network_ipv6').addEventListener('paste', function (e) {
        let pastedData = e.clipboardData.getData('text');
        if (pastedData.includes('/')) {
            let [network, netSize] = pastedData.split('/');
            document.getElementById('network_ipv6').value = network;
            document.getElementById('netsize').value = netSize;
        }
        e.preventDefault();
    });

    // Slash key handling
    document.getElementById('network_ipv4').addEventListener('keydown', function (e) {
        if (e.key === '/') {
            e.preventDefault();
            document.getElementById('netsize').focus();
            document.getElementById('netsize').select();
        }
    });

    document.getElementById('network_ipv6').addEventListener('keydown', function (e) {
        if (e.key === '/') {
            e.preventDefault();
            document.getElementById('netsize').focus();
            document.getElementById('netsize').select();
        }
    });

    // Input validation
    document.getElementById('network_ipv4').addEventListener('input', function() {
        document.getElementById('input_form').classList.add('was-validated');
    });

    document.getElementById('network_ipv6').addEventListener('input', function() {
        document.getElementById('input_form').classList.add('was-validated');
    });

    document.getElementById('netsize').addEventListener('input', function() {
        document.getElementById('input_form').classList.add('was-validated');
    });



    // Go button
    document.getElementById('btn_go').addEventListener('click', function() {
        const btn = this;
        const originalText = btn.textContent;
        
        // Add loading state
        btn.textContent = 'Processing...';
        btn.disabled = true;
        
        document.getElementById('input_form').classList.remove('was-validated');
        
        // Simple validation
        let isValid = true;
        let networkInput, netSizeInput;
        
        if (currentIPVersion === 'ipv4') {
            networkInput = document.getElementById('network_ipv4').value;
            netSizeInput = document.getElementById('netsize').value;
            let ipv4Pattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
            if (!ipv4Pattern.test(networkInput)) {
                isValid = false;
            }
        } else {
            networkInput = document.getElementById('network_ipv6').value;
            netSizeInput = document.getElementById('netsize').value;
            if (!isValidIPv6(networkInput)) {
                isValid = false;
            }
        }
        
        let netSizePattern = currentIPVersion === 'ipv4' ? /^([0-9]|[12][0-9]|3[0-2])$/ : /^([0-9]|[1-9][0-9]|1[0-2][0-8])$/;
        if (!netSizePattern.test(netSizeInput)) {
            isValid = false;
        }
        
        // Use minimal delay for visual feedback
        setTimeout(() => {
            if (isValid) {
                document.getElementById('input_form').classList.add('was-validated');
                reset();
            } else {
                show_warning_modal('<div>Please correct the errors in the form!</div>');
            }
            
            // Reset button state
            btn.textContent = originalText;
            btn.disabled = false;
        }, 100);
    });

    // Operating mode dropdowns
    document.getElementById('dropdown_standard').addEventListener('click', function() {
        previousOperatingMode = operatingMode;
        operatingMode = 'Standard';
        if(!switchMode(operatingMode)) {
            operatingMode = previousOperatingMode;
            document.getElementById('dropdown_'+ operatingMode.toLowerCase()).classList.add('active');
        }
    });

    document.getElementById('dropdown_azure').addEventListener('click', function() {
        previousOperatingMode = operatingMode;
        operatingMode = 'AZURE';
        if(!switchMode(operatingMode)) {
            operatingMode = previousOperatingMode;
            document.getElementById('dropdown_'+ operatingMode.toLowerCase()).classList.add('active');
        }
    });

    document.getElementById('dropdown_aws').addEventListener('click', function() {
        previousOperatingMode = operatingMode;
        operatingMode = 'AWS';
        if(!switchMode(operatingMode)) {
            operatingMode = previousOperatingMode;
            document.getElementById('dropdown_'+ operatingMode.toLowerCase()).classList.add('active');
        }
    });

    document.getElementById('dropdown_oci').addEventListener('click', function() {
        previousOperatingMode = operatingMode;
        operatingMode = 'OCI';
        if(!switchMode(operatingMode)) {
            operatingMode = previousOperatingMode;
            document.getElementById('dropdown_'+ operatingMode.toLowerCase()).classList.add('active');
        }
    });

    // Import/Export
    document.getElementById('importBtn').addEventListener('click', function() {
        try {
            importConfig(JSON.parse(document.getElementById('importExportArea').value));
        } catch (e) {
            show_warning_modal('<div>Invalid JSON configuration!</div>');
        }
    });


    // Copy URL
    document.getElementById('copy_url').addEventListener('click', function() {
        // Get the base URL including repository path for GitHub Pages
        let baseUrl = window.location.origin;
        let pathname = window.location.pathname;
        
        // If we're on GitHub Pages and not at the root, include the repository path
        if (pathname && pathname !== '/' && pathname !== '/index.html') {
            // Remove the filename (index.html) if present
            let pathParts = pathname.split('/');
            if (pathParts[pathParts.length - 1] === 'index.html') {
                pathParts.pop();
            }
            baseUrl += pathParts.join('/');
        }
        
        let url = baseUrl + getConfigUrl();
        navigator.clipboard.writeText(url);
        document.querySelector('#copy_url span').textContent = 'Copied!';
        setTimeout(function(){
            document.querySelector('#copy_url span').textContent = 'Copy Shareable URL';
        }, 2000);
    });

    // Import/Export modal
    document.getElementById('btn_import_export').addEventListener('click', function() {
        document.getElementById('importExportArea').value = JSON.stringify(exportConfig(false), null, 2);
    });

    // Split/Join functionality
    document.getElementById('calcbody').addEventListener('click', function(event) {
        // Find the closest split or join cell (in case we clicked on the span inside)
        let targetCell = event.target.closest('.split, .join');
        
        if (targetCell) {
            // Process immediately without any delay or animation
            mutate_subnet_map(targetCell.dataset.mutateVerb, targetCell.dataset.subnet, '');
            targetCell.dataset.subnet = sortIPCIDRs(targetCell.dataset.subnet);
            renderTable(operatingMode);
        }
    });

    // Note handling
    document.getElementById('calcbody').addEventListener('keyup', function(event) {
        if (event.target.classList.contains('note') && event.target.tagName === 'INPUT') {
            let delay = 1000;
            clearTimeout(noteTimeout);
            noteTimeout = setTimeout(function(element) {
                mutate_subnet_map('note', element.dataset.subnet, '', element.value);
            }, delay, event.target);
        }
    });

    document.getElementById('calcbody').addEventListener('focusout', function(event) {
        if (event.target.classList.contains('note') && event.target.tagName === 'INPUT') {
            clearTimeout(noteTimeout);
            mutate_subnet_map('note', event.target.dataset.subnet, '', event.target.value);
        }
    });

    // Initialize
    // Check for URL configuration first
    if (!processConfigUrl()) {
        reset();
    }
});
