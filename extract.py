import os
import re

filepath = r'c:\Users\devil\Downloads\PROTOTYPE_1.0\frontend\templates\readiness.html'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Extract CSS
style_start = content.find('<style>')
style_end = content.find('</style>', style_start) + len('</style>')
css_content = content[style_start + len('<style>'):style_end - len('</style>')].strip()

# Write CSS
css_path = r'c:\Users\devil\Downloads\PROTOTYPE_1.0\frontend\static\css\readiness.css'
os.makedirs(os.path.dirname(css_path), exist_ok=True)
with open(css_path, 'w', encoding='utf-8') as f:
    f.write(css_content)

# Update HTML by replacing CSS
new_content = content[:style_start] + "{% block extra_head %}\n<link rel=\"stylesheet\" href=\"{% static 'css/readiness.css' %}?v=1\">\n{% endblock %}\n" + content[style_end:]

# Extract JS
# Find the script tag without application/json
script_matches = list(re.finditer(r'<script>', new_content))
last_script_start = script_matches[-1].start()
last_script_end = new_content.find('</script>', last_script_start) + len('</script>')
js_content = new_content[last_script_start + len('<script>'):last_script_end - len('</script>')].strip()

# Write JS
js_path = r'c:\Users\devil\Downloads\PROTOTYPE_1.0\frontend\static\js\readiness.js'
os.makedirs(os.path.dirname(js_path), exist_ok=True)
with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js_content)

# Update HTML by replacing JS
new_content = new_content[:last_script_start] + "{% block extra_scripts %}\n<script src=\"{% static 'js/readiness.js' %}?v=1\"></script>\n{% endblock %}\n" + new_content[last_script_end:]

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Extraction and replacement complete.")
