import os

os.makedirs('public/assets/logos/hero', exist_ok=True)

logos = [
  {"name": "nyda", "text": "NYDA", "color": "#009045"},
  {"name": "idc", "text": "IDC", "color": "#005a9c"},
  {"name": "dtic", "text": "the dtic", "color": "#005a9c"},
  {"name": "ecdc", "text": "ECDC", "color": "#f37021"},
  {"name": "tia", "text": "TIA", "color": "#005a9c"},
  {"name": "gep", "text": "GEP", "color": "#009045"},
  {"name": "fnb", "text": "FNB", "color": "#009045"},
  {"name": "standardbank", "text": "Standard Bank", "color": "#005a9c"},
  {"name": "nedbank", "text": "Nedbank", "color": "#009045"},
  {"name": "buildit", "text": "Build it", "color": "#f37021"},
  {"name": "cashbuild", "text": "Cashbuild", "color": "#e31837"}
]

for logo in logos:
    svg_content = f"""<svg width="200" height="100" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="100" fill="transparent"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="28" fill="{logo['color']}">{logo['text']}</text>
</svg>"""
    with open(f"public/assets/logos/hero/{logo['name']}.svg", "w") as f:
        f.write(svg_content)
        
print("SVGs generated.")
