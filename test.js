const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');
let openCount = 0;
let lastOpenLines = [];
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    if (line[j] === '{') {
      openCount++;
      lastOpenLines.push(i + 1);
    } else if (line[j] === '}') {
      openCount--;
      lastOpenLines.pop();
    }
  }
}
console.log('Open brackets:', openCount);
console.log('Unclosed brackets at lines:', lastOpenLines);
