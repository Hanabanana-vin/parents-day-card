from PIL import Image

def make_transparent(filename):
    img = Image.open(filename).convert("RGBA")
    datas = img.getdata()
    newData = []
    for item in datas:
        # white background detection (allowing slight off-white)
        if item[0] > 240 and item[1] > 240 and item[2] > 240:
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)
    img.putdata(newData)
    img.save(filename, "PNG")

make_transparent("bud.png")
make_transparent("flower.png")
print("Done")
