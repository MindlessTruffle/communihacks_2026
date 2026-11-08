import sys,os
from PIL import Image
d=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','public','ui','icons')
fs=sorted(f for f in os.listdir(d) if f.endswith('.png'))
cols=8; W=Image.new('RGBA',(cols*130,((len(fs)+cols-1)//cols)*130),(110,150,110,255))
for i,f in enumerate(fs):
    im=Image.open(os.path.join(d,f)).resize((120,120)); W.paste(im,((i%cols)*130+5,(i//cols)*130+5),im)
W.save(sys.argv[1]); print(fs)
