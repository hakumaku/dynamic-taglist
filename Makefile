TARGET=dyanmic-taglist@hakumaku.github.io.zip
XDG_DATA_HOME ?= ~/.local/share
INSTALL_PATH=$(XDG_DATA_HOME)/gnome-shell/extensions

.PHONY: all build install listen listen-pref format

all: build install

build:
	# TODO: transpile
	mkdir -p _build
	cp -r src/* _build
	cp -r schemas _build
	(cd _build && glib-compile-schemas schemas && zip -r ../$(TARGET) .)

install: build
	mv $(TARGET) $(INSTALL_PATH)
	gnome-extensions install --force $(INSTALL_PATH)/$(TARGET)
	rm $(INSTALL_PATH)/$(TARGET)

listen:
	journalctl -f -o cat /usr/bin/gnome-shell

listen-pref:
	journalctl -f -o cat /usr/bin/gjs
	
format:
	prettier --write "src/*.{js,ts,json,css}"
