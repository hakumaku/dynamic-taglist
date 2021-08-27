'use strict';

const { Gdk, Gio, GLib, GObject, Gtk, Pango } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const ExtensionSettings = Me.imports.settings.ExtensionSettings;
const WORKSPACE_MAX = 36;
const WINDOW_RULE_ROW_VARIANT_STR = 'a{ss}';

const WindowRuleAppChooserDialog = GObject.registerClass(
  class WindowRuleAppChooserDialog extends Gtk.AppChooserDialog {
    _init(parent) {
      super._init({
        transient_for: parent,
        modal: true,
      });
      const widget = this.get_widget();
      widget.set_show_all(true);
      widget.set_show_other(true);
    }
  },
);

const WindowRuleAddIcon = GObject.registerClass(
  class WindowRuleAddIcon extends Gtk.ListBoxRow {
    _init() {
      super._init({
        action_name: 'window-rule.add',
      });
      let icon = new Gtk.Image({
        icon_name: 'list-add-symbolic',
        pixel_size: 32,
        margin_top: 3,
        margin_bottom: 3,
        valign: Gtk.Align.CENTER,
        halign: Gtk.Align.CENTER,
      });
      this.set_child(icon);
    }
  },
);

const WindowRuleRow = GObject.registerClass(
  {
    Name: 'WindowRuleRow',
    GTypeName: 'WindowRuleRow',
    // https://wiki.gnome.org/Projects/GnomeShell/Extensions/MigratingShellClasses
    Properties: {
      app_id: GObject.ParamSpec.string(
        'app_id', // Property Name
        'app_id', // Nickname
        'app_id', // Description
        GObject.ParamFlags.READABLE, // Flags
        null, // Implement defaults manually
      ),
      workspace_index: GObject.ParamSpec.uint(
        'workspace_index', // Property Name
        'workspace_index', // Nickname
        'workspace_index', // Description
        GObject.ParamFlags.READWRITE, // Flags
        null, // Implement defaults manually
      ),
    },
  },
  class WindowRuleRow extends Gtk.ListBoxRow {
    _init(app_info, workspace_index) {
      super._init();
      this._app_info = app_info;
      this._workspace_index = workspace_index;

      const box = new Gtk.Box({
        spacing: 3,
        margin_top: 3,
        margin_bottom: 3,
        margin_start: 12,
        margin_end: 12,
      });
      this.set_child(box);

      const icon = new Gtk.Image({
        gicon: app_info.get_icon(),
        pixel_size: 32,
      });
      box.append(icon);

      const label = new Gtk.Label({
        label: app_info.get_display_name(),
        halign: Gtk.Align.START,
        hexpand: true,
        max_width_chars: 20,
        ellipsize: Pango.EllipsizeMode.END,
      });
      box.append(label);

      const spin_button = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
          lower: 1,
          upper: WORKSPACE_MAX,
          step_increment: 1,
        }),
        value: this._workspace_index,
        snap_to_ticks: true,
        margin_end: 6,
      });
      spin_button.connect('value-changed', (button) => {
        this.workspace_index = button.get_value_as_int();
        this.activate_action('window-rule.update', this.to_variant());
      });
      box.append(spin_button);

      const button = new Gtk.Button({
        action_name: 'window-rule.remove',
        action_target: this.to_variant(),
        label: 'Remove',
      });
      box.append(button);
    }

    get app_id() {
      return this._app_info.get_id();
    }

    get workspace_index() {
      return this._workspace_index;
    }

    set workspace_index(value) {
      this._workspace_index = value;
    }

    to_variant() {
      return new GLib.Variant(WINDOW_RULE_ROW_VARIANT_STR, {
        app_id: this.app_id,
        workspace_index: `${this.workspace_index}`,
      });
    }
  },
);

const WindowRuleList = GObject.registerClass(
  class WindowRuleList extends Gtk.ListBox {
    _init(root_window) {
      super._init({
        selection_mode: Gtk.SelectionMode.NONE,
        show_separators: true,
        valign: Gtk.Align.START,
        hexpand: true,
      });

      // Load window rules from settings.
      const settings = new ExtensionSettings();
      settings.window_rule.forEach((rule) => {
        const [app_id, workspace_index] = rule.split(',');
        const app_info = Gio.DesktopAppInfo.new(app_id);
        this.append(new WindowRuleRow(app_info, workspace_index));
      });
      this.append(new WindowRuleAddIcon());

      // Bind events.
      let group = new Gio.SimpleActionGroup();
      this.insert_action_group('window-rule', group);

      // "window-rule.add" event
      let add_action = new Gio.SimpleAction({ name: 'add' });
      add_action.connect('activate', () => {
        const app_dialog = new WindowRuleAppChooserDialog(
          root_window.get_root(),
        );
        app_dialog.connect('response', (dialog, response_id) => {
          if (response_id === Gtk.ResponseType.OK) {
            // "id" is like "Alacritty.desktop", not integer.
            // "app" is like "Alacritty", not object.
            const app_id = dialog.get_widget().get_app_info().get_id();
            const workspace_index = 1;
            settings.add_window_rule(app_id, workspace_index);
            this._add_row(app_id, workspace_index);
          }
          dialog.destroy();
        });
        app_dialog.show();
      });
      group.add_action(add_action);

      // "window-rule.remove" event
      let remove_action = new Gio.SimpleAction({
        name: 'remove',
        parameter_type: new GLib.VariantType(WINDOW_RULE_ROW_VARIANT_STR),
      });
      remove_action.connect('activate', (_action, action_target) => {
        const arg = action_target.deep_unpack();
        settings.remove_window_rule(arg.app_id);
        this._remove_row(arg.app_id);
      });
      group.add_action(remove_action);

      // "window-rule.update" event
      let update_action = new Gio.SimpleAction({
        name: 'update',
        parameter_type: new GLib.VariantType(WINDOW_RULE_ROW_VARIANT_STR),
      });
      update_action.connect('activate', (_action, action_target) => {
        const arg = action_target.deep_unpack();
        settings.update_window_rule(arg.app_id, arg.workspace_index);
        this._update_row(arg.app_id, arg.workspace_index);
      });
      group.add_action(update_action);
    }

    _add_row(app_id, workspace_index) {
      const pos = [...this].length;
      const app_info = Gio.DesktopAppInfo.new(app_id);
      this.insert(new WindowRuleRow(app_info, workspace_index), pos - 1);
    }

    _remove_row(app_id) {
      const children = [...this];
      const child = children.find((child) => {
        return child.app_id === app_id;
      });
      if (child) {
        this.remove(child);
      }
    }

    _update_row(app_id, workspace_index) {
      const children = [...this];
      const child = children.find((child) => {
        return child.app_id === app_id;
      });
      if (child) {
        child.workspace_index = workspace_index;
      }
    }
  },
);

const WorkspaceIndicatorWindowRuleSettings = GObject.registerClass(
  class WorkspaceIndicatorWindowRuleSettings extends Gtk.ScrolledWindow {
    _init() {
      super._init({
        margin_start: 20,
        margin_end: 20,
        margin_top: 20,
        margin_bottom: 20,
        vexpand: true,
        min_content_height: 180,
      });
      this.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTO);

      let box = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        hexpand: true,
        vexpand: true,
      });
      box.append(new WindowRuleList(this));

      this.set_child(box);
    }
  },
);

const WorkspaceIndicatorGeneralSettings = GObject.registerClass(
  class WorkspaceIndicatorGeneralSettings extends Gtk.Grid {
    _init() {
      super._init({
        margin_start: 20,
        margin_end: 20,
        margin_top: 20,
        margin_bottom: 20,
        column_spacing: 12,
        row_spacing: 12,
      });

      // "show-empty-workspace"
      let static_workspace_label = new Gtk.Label({
        label: 'Show Empty Workspace',
        xalign: 0,
        hexpand: true,
      });
      let static_workspace = new Gtk.Switch({ halign: Gtk.Align.END });

      // "show-icon"
      let show_icon_label = new Gtk.Label({
        label: 'Show Icon',
        xalign: 0,
      });
      let show_icon = new Gtk.Switch({ halign: Gtk.Align.END });

      // "color-picker"
      let color_picker_label = new Gtk.Label({
        label: 'Indicator Color',
        xalign: 0,
      });
      let color_picker = new Gtk.ColorButton({
        modal: true,
      });

      // Attach all items to widget.
      this.attach(static_workspace_label, 0, 0, 1, 1);
      this.attach(static_workspace, 1, 0, 1, 1);
      this.attach(show_icon_label, 0, 1, 1, 1);
      this.attach(show_icon, 1, 1, 1, 1);
      this.attach(color_picker_label, 0, 2, 1, 1);
      this.attach(color_picker, 1, 2, 1, 1);

      // Bind schemas to each item.
      let widgets = { static_workspace, show_icon, color_picker };
      this._bind(widgets);
    }

    _bind(widgets) {
      const settings = new ExtensionSettings();

      // Bind all options to schema.
      widgets.static_workspace.set_active(settings.static_workspace);
      widgets.static_workspace.connect('state-set', (_widget, state) => {
        settings.static_workspace = state;
      });

      widgets.show_icon.set_active(settings.show_icon);
      widgets.show_icon.connect('state-set', (_widget, state) => {
        settings.show_icon = state;
      });

      widgets.color_picker.set_rgba(settings.indicator_color);
      widgets.color_picker.connect('color-set', (widget) => {
        settings.indicator_color = widget.get_rgba();
      });
    }
  },
);

const WorkspaceIndicatorPrefsWidget = GObject.registerClass(
  class WorkspaceIndicatorPrefsWidget extends Gtk.Grid {
    _init() {
      super._init({
        orientation: Gtk.Orientation.VERTICAL,
        margin_start: 12,
        margin_end: 12,
        margin_top: 18,
        margin_bottom: 18,
      });

      const general_label = new Gtk.Label({
        label: 'General Settings',
        halign: Gtk.Align.START,
      });
      const general = new WorkspaceIndicatorGeneralSettings();

      const rule_label = new Gtk.Label({
        label: 'Window Rules',
        halign: Gtk.Align.START,
      });
      const rule = new WorkspaceIndicatorWindowRuleSettings();

      this.attach(general_label, 0, 0, 1, 1);
      this.attach(general, 0, 1, 1, 1);
      this.attach(rule_label, 0, 2, 1, 1);
      this.attach(rule, 0, 3, 1, 1);
    }
  },
);

function init() {}

function buildPrefsWidget() {
  let widget = new WorkspaceIndicatorPrefsWidget();
  return widget;
}
