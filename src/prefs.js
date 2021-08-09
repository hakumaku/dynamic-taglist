const Settings = imports.gi.Gio.Settings;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const ExtensionSettings = Me.imports.settings.ExtensionSettings;

const WorkspaceIndicatorPrefsWidget = new GObject.Class({
  Name: 'WorkspaceIndicator.Prefs.Widget',
  GTypeName: 'WorkspaceIndicatorPrefsWidget',
  Extends: Gtk.Grid,

  _init: function (params) {
    this.parent(params);
    // Config preference widget here.
    this.margin_start = 20;
    this.margin_end = 20;
    this.margin_top = 20;
    this.margin_bottom = 20;
    this.column_spacing = 12;
    this.row_spacing = 12;

    // Create each preference here.
    // "show-empty-workspace"
    let static_workspace_label = new Gtk.Label({
      label: 'Show Empty Workspace',
      xalign: 0.0,
      hexpand: true,
    });
    let static_workspace = new Gtk.Switch({ halign: Gtk.Align.END });

    // "show-icon"
    let show_icon_label = new Gtk.Label({
      label: 'Show Icon',
      xalign: 0.0,
    });
    let show_icon = new Gtk.Switch({ halign: Gtk.Align.END });

    // Attach all items to widget.
    this.attach(static_workspace_label, 0, 0, 1, 1);
    this.attach(static_workspace, 1, 0, 1, 1);
    this.attach(show_icon_label, 0, 1, 1, 1);
    this.attach(show_icon, 1, 1, 1, 1);

    // Bind schemas to each item.
    let widgets = { static_workspace, show_icon };
    this._bind(widgets);
  },

  _bind(widgets) {
    let settings = new ExtensionSettings();

    // Bind all options to schema.
    widgets.static_workspace.set_active(settings.get_static_workspace());
    widgets.static_workspace.connect('state-set', (_widget, state) => {
      settings.set_static_workspace(state);
    });

    widgets.show_icon.set_active(settings.get_show_icon());
    widgets.show_icon.connect('state-set', (_widget, state) => {
      settings.set_show_icon(state);
    });
  },
});

function init() {}

function buildPrefsWidget() {
  let widget = new WorkspaceIndicatorPrefsWidget();
  return widget;
}
