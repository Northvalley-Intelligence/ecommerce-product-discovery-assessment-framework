import json
G=[("grill stand","Nest for Large Egg",1),("mitt","EGGmitt High Heat BBQ Glove, extra-long",1),("mitt","Large Hell Hands™",1),
("can cooler","BGE Insulated Beverage Cooler - green w/white logo",1),("can cooler","Big Green Egg x YETI Hopper Flip 12 Cooler",1),
("replace worn gasket","Ultra Performance Gasket Replacement Kit for 2XL, XL & Large",1),("replace worn gasket","Dome for Large EGG",0),
("rack","Nest Utility Rack",1),("rack","2-Piece Multi-Level Rack for XL",1),("egg","5-Piece EGGspander Kit for L",1),
("can i cook on the egg in the winter","XL Big Green Egg in 69-inch Modern Farmhouse Table Package",0),
("mens t-shirt","Big Green Egg Mens Bone T-Shirt - Large",1),("bge","Fire Ring for Large EGG",1),
("wing sauce","Big Green Egg Wing Sauce - Original Buffalo",1),("wing sauce","Big Green Egg BBQ Sauce, Kentucky Bourbon Grilling Glaze",0),
("smoky sauce","Big Green Egg BBQ Sauce, Kansas City Style - Sweet & Smoky",1),
("apron","Large Big Green Egg",0),("apron","Table - Solid Acacia Hardwood for Large EGG",0),("apron","WiFi Display",0),
("compact grill","MiniMax Big Green Egg",1),("compact grill","Medium Big Green Egg",0),
("igniter","EGGniter® Electric Charcoal Lighter with Fan (1500 Watt/120v)",1),("igniter","Twisters Firestarters",1),("igniter","Quick Light™ Kit Large",1),
("hoodie","Big Green Egg Mens Gray Olsen Hoodie - 2XL",1),("minimax egg","MiniMax Big Green Egg",1),("minimax egg","Portable Nest for MiniMax EGG",0),
("top vent","rEGGulator Vent Cap (for 2XL, XL, L, M)",1),("top vent","rEGGulator Rain Cap (for S, MX)",0),
("gasket","Quick Light™ Kit Large",0),("cutting board","Bamboo Cutting Board",1),("cutting board","Carbon Steel Grill Wok w/ Bamboo Spatula",0),
("barbecue","Medium Big Green Egg",1),("xl tshirt","Atlanta Skyline T-shirt",1)]
c={r['q']:r for r in json.load(open('captures.json'))['rows']}
out=[]
for q,t,l in G:
    it=c[q]['items']; assert t in it,(q,t)
    out.append({"query":q,"product":t,"rank":it.index(t)+1,"human_relevant":l})
json.dump(out,open('raw/gold-pairs.json','w'),indent=1); print(len(out),sum(o['human_relevant'] for o in out))
