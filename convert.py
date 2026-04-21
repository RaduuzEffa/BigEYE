import os

def convert_to_iife(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    if content.strip().startswith('(() => {'):
        return # Already converted

    new_content = '(() => {\n' + content + '\n})();'
    
    with open(filepath, 'w') as f:
        f.write(new_content)

convert_to_iife('js/app.js')
convert_to_iife('js/recorder.js')

html_path = 'index.html'
with open(html_path, 'r') as f:
    html = f.read()

html = html.replace('type="module" ', '')

with open(html_path, 'w') as f:
    f.write(html)

print("Converted successfully.")
