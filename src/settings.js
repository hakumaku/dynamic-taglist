const Gio = imports.gi.Gio;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const SchemaFields = {
  StaticWorkspace: 'static-workspace',
  ShowIcon: 'show-icon',
};

let read_schema = function (schema) {
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

class ExtensionSettings {
  constructor() {
    this.schema = read_schema('org.gnome.shell.extensions.workspace-indicator');
  }

  get_static_workspace() {
    return this.schema.get_boolean(SchemaFields.StaticWorkspace);
  }

  set_static_workspace(value) {
    this.schema.set_boolean(SchemaFields.StaticWorkspace, value);
  }

  get_show_icon() {
    return this.schema.get_boolean(SchemaFields.ShowIcon);
  }

  set_show_icon(value) {
    this.schema.set_boolean(SchemaFields.ShowIcon, value);
  }
}
