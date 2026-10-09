"""Recorre el instalador NSIS asistido (no silencioso) pulsando sus botones y captura cada pantalla.
Uso: python test/gui-install.py <instalador.exe> <carpeta_instalacion> <carpeta_capturas> [--no-run]
Captura SOLO la ventana del instalador (PrintWindow), nunca el resto del escritorio."""
import ctypes, ctypes.wintypes as wt, subprocess, sys, time, os
from PIL import Image

user32, gdi32 = ctypes.windll.user32, ctypes.windll.gdi32
user32.SetProcessDPIAware()
exe, target, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
subprocess.Popen([exe])
WM_SETTEXT, BM_CLICK = 0x000C, 0x00F5

def text(h):
    b = ctypes.create_unicode_buffer(512); user32.GetWindowTextW(h, b, 512); return b.value

def find_main(wait=90):
    t0 = time.time()
    while time.time() - t0 < wait:
        found = []
        @ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)
        def cb(h, _):
            t = text(h)
            if user32.IsWindowVisible(h) and 'MasterWar' in t and ('Instal' in t or 'Setup' in t):
                cls = ctypes.create_unicode_buffer(64); user32.GetClassNameW(h, cls, 64)
                if cls.value == '#32770': found.append(h)
            return True
        user32.EnumWindows(cb, 0)
        if found: return found[0]
        time.sleep(0.3)
    raise SystemExit('no encuentro la ventana del instalador')

def shot(h, name):
    r = wt.RECT()
    if not user32.IsWindow(h): return
    user32.GetWindowRect(h, ctypes.byref(r)); w, hh = r.right - r.left, r.bottom - r.top
    hdc = user32.GetWindowDC(h); mdc = gdi32.CreateCompatibleDC(hdc); bmp = gdi32.CreateCompatibleBitmap(hdc, w, hh)
    gdi32.SelectObject(mdc, bmp); user32.PrintWindow(h, mdc, 2)
    class BIH(ctypes.Structure):
        _fields_ = [('s', wt.DWORD), ('w', wt.LONG), ('h', wt.LONG), ('p', wt.WORD), ('b', wt.WORD), ('c', wt.DWORD), ('i', wt.DWORD), ('x', wt.LONG), ('y', wt.LONG), ('u', wt.DWORD), ('m', wt.DWORD)]
    bi = BIH(ctypes.sizeof(BIH), w, -hh, 1, 32, 0, 0, 0, 0, 0, 0)
    buf = ctypes.create_string_buffer(w * hh * 4); gdi32.GetDIBits(mdc, bmp, 0, hh, buf, ctypes.byref(bi), 0)
    Image.frombuffer('RGBA', (w, hh), buf, 'raw', 'BGRA', 0, 1).convert('RGB').save(os.path.join(out, name))
    gdi32.DeleteObject(bmp); gdi32.DeleteDC(mdc); user32.ReleaseDC(h, hdc)
    print('captura', name, '|', text(h), flush=True)

def click(h, ctl=1):
    b = user32.GetDlgItem(h, ctl); print('  click', ctl, repr(text(b)), flush=True)
    user32.SendMessageW(b, BM_CLICK, 0, 0)

def page(h): return user32.FindWindowExW(h, 0, '#32770', None)

main = find_main(); time.sleep(1.2)
shot(main, '1-bienvenida.png'); click(main)
time.sleep(1.2); shot(main, '2-terminos.png'); click(main)
edit = 0
for _ in range(60):                             # esperar a la pagina de ubicacion (puede haber pagina de modo antes)
    time.sleep(0.5)
    edit = user32.GetDlgItem(page(main), 1019)
    if edit: break
user32.SendMessageW(edit, WM_SETTEXT, 0, ctypes.c_wchar_p(target))
time.sleep(0.5); shot(main, '3-ubicacion.png'); click(main)
n, last, t0 = 0, '', time.time()
while time.time() - t0 < 900 and user32.IsWindow(main):
    time.sleep(0.15)
    if user32.GetDlgItem(page(main), 1203) or user32.GetDlgItem(page(main), 1204): break      # página final
    sub = text(user32.GetDlgItem(main, 1038))
    if sub != last and n < 400:
        last = sub; n += 1; print('  subtitulo:', repr(sub), flush=True); (n % 8 == 1 or n < 3) and shot(main, f'4-progreso-{n:02d}.png')
time.sleep(1.0); shot(main, '5-final.png')
if '--no-run' in sys.argv and user32.IsWindow(main):
    user32.SendMessageW(user32.GetDlgItem(page(main), 1203), BM_CLICK, 0, 0)    # desmarcar "Iniciar MasterWar"
if user32.IsWindow(main): click(main)
time.sleep(2); print('fin')
