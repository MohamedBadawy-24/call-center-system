const xlsx = require('xlsx');

function testImport(data) {
    const results = [];
    data.forEach(row => {
        const keys = Object.keys(row);
        const phoneKey = keys.find(k => {
            const lowerK = String(k).toLowerCase().trim();
            return lowerK === 'number' || lowerK === 'phone' || lowerK === 'mobile' || 
                   lowerK === 'telephone' || lowerK === 'cell' || lowerK === 'num';
        });

        const numberValue = phoneKey ? row[phoneKey] : (row.number || row.Number || row.NUMBER);
        if (numberValue) {
            results.push({
                number: String(numberValue).trim()
            });
        }
    });
    return results;
}

// Test Case 1: Standard headers
console.log('Test 1:', testImport([{ 'Phone': '123456' }, { 'number': '7890' }]));

// Test Case 2: No headers (sheet_to_json default behavior)
// If there are no headers and sheet_to_json is called, it treats the first row as headers.
// If the first row is a number, then the keys will be those numbers.
console.log('Test 2:', testImport([{ '123456': '7890' }])); // First row was 123456

// Test Case 3: Empty
console.log('Test 3:', testImport([]));
