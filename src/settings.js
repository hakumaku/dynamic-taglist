'use strict';

const { Gdk, Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const SchemaFields = {
  StaticWorkspace: 'static-workspace',
  ShowIcon: 'show-icon',
  IndicatorColor: 'indicator-color',
  WindowRule: 'window-rule',
};

const read_schema = function (schema) {
  const GioSSS = Gio.SettingsSchemaSource;
  const schema_dir = Me.dir.get_child('schemas');

  let schema_src = schema_dir.query_exists(null)
    ? GioSSS.new_from_directory(
        schema_dir.get_path(),
        GioSSS.get_default(),
        false,
      )
    : GioSSS.get_default();

  const schema_obj = schema_src.lookup(schema, true);
  if (!schema_obj) {
    throw new Error(
      'Schema ' +
        schema +
        ' could not be found for extension ' +
        Me.metadata.uuid +
        '. Please check your installation.',
    );
  }

  return new Gio.Settings({ settings_schema: schema_obj });
};

const find_window_rule = function (id) {
  return (rule) => {
    const [app_id, _] = rule.split(',');
    return app_id === id;
  };
};

var ExtensionSettings = class ExtensionSettings {
  constructor() {
    this.schema = read_schema('org.gnome.shell.extensions.dynamic-taglist');
  }

  get static_workspace() {
    return this.schema.get_boolean(SchemaFields.StaticWorkspace);
  }

  set static_workspace(value) {
    this.schema.set_boolean(SchemaFields.StaticWorkspace, value);
  }

  get show_icon() {
    return this.schema.get_boolean(SchemaFields.ShowIcon);
  }

  set show_icon(value) {
    this.schema.set_boolean(SchemaFields.ShowIcon, value);
  }

  get indicator_color() {
    let color = new Gdk.RGBA();
    color.parse(this.schema.get_string(SchemaFields.IndicatorColor));
    return color;
  }

  set indicator_color(value) {
    this.schema.set_string(SchemaFields.IndicatorColor, value.to_string());
  }

  get window_rule() {
    return this.schema.get_strv(SchemaFields.WindowRule);
  }

  set window_rule(value) {
    this.schema.set_strv(SchemaFields.WindowRule, value);
  }

  add_window_rule(app_id, workspace_index) {
    let window_rule = this.window_rule;
    let index = window_rule.findIndex(find_window_rule(app_id));
    if (index === -1) {
      window_rule.push(`${app_id},${workspace_index}`);
      this.window_rule = window_rule;
    }
  }

  remove_window_rule(app_id) {
    this.window_rule = this.window_rule.filter((rule) => {
      const [id, _] = rule.split(',');
      return id !== app_id;
    });
  }

  update_window_rule(app_id, new_workspace_index) {
    let window_rule = this.window_rule;
    let index = window_rule.findIndex(find_window_rule(app_id));
    if (index !== -1) {
      window_rule[index] = `${app_id},${new_workspace_index}`;
      this.window_rule = window_rule;
    }
  }
};
