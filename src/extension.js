const { Clutter, GObject, Gtk, Shell, St } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;

const activities = Main.panel.statusArea.activities;
const workspace_manager = global.workspace_manager;
const AppSystem = Shell.AppSystem.get_default();

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const ExtensionSettings = Me.imports.settings.ExtensionSettings;

// Count windows in the current workspace.
// Applications such as "Plank" which are placed across all workspaces is not counted.
let count_windows = function (workspace) {
  const windows = workspace.list_windows();
  return windows.filter((window) => window.is_on_all_workspaces() === false)
    .length;
};

// Find the first app that is on this workspace, and set icon.
let get_first_app_icon = function (workspace) {
  const apps = AppSystem.get_running();
  let app = apps.find(
    (app) => app.is_on_workspace(workspace) && typeof app.icon !== 'undefined',
  );
  return app ? app.icon : null;
};

const WorkspaceIndicatorChild = class WorkspaceIndicatorChild {
  constructor(label, workspace) {
    this._workspace = workspace;
    this._text = new St.Label({
      text: label,
      y_align: Clutter.ActorAlign.CENTER,
      style_class: 'workspace-indicator-text',
    });
    this._icon = new St.Icon({
      y_align: Clutter.ActorAlign.CENTER,
      style_class: 'workspace-indicator-icon',
    });
  }

  get_text() {
    return this._text;
  }

  get_icon_or_text() {
    let icon = get_first_app_icon(this._workspace);
    if (icon) {
      this._icon.set_gicon(icon);
    }
    return icon !== null ? this._icon : this._text;
  }

  destroy() {
    this._icon.destroy();
    this._text.destroy();
  }
};

const WorkspaceIndicator = GObject.registerClass(
  class WorkspaceIndicator extends St.Button {
    _init(label, active, workspace, option) {
      super._init();
      this.add_style_class_name('workspace-indicator');
      this._active = active;
      this._workspace = workspace;
      this._option = option;
      this._n_windows = count_windows(workspace);
      this._child = new WorkspaceIndicatorChild(label, workspace);
      // Connect to events to listen.
      this._connect();

      this._render();
    }

    destroy() {
      this._child.destroy();
      // Disconnect all registered events.
      this._disconnect();
      super.destroy();
    }

    _connect() {
      this._window_added = this._workspace.connect('window-added', () => {
        this._window_added_event();
      });
      this._window_removed = this._workspace.connect('window-removed', () => {
        this._window_removed_event();
      });
      this._clicked = this.connect('clicked', () => {
        this._clicked_event();
      });
    }

    _disconnect() {
      this._workspace.disconnect(this._window_added);
      this._workspace.disconnect(this._window_removed);
      this.disconnect(this._clicked);
    }

    set_active(value) {
      this._active = value;
      this._render();
    }

    _window_added_event() {
      this._n_windows = count_windows(this._workspace);
      this._render();
    }

    _window_removed_event() {
      this._n_windows = count_windows(this._workspace);
      this._render();
    }

    _clicked_event() {
      this._workspace.activate(global.get_current_time());
    }

    // Display indicator based on its state.
    _render() {
      if (this._active) {
        this.add_style_class_name('active');
      } else {
        this.remove_style_class_name('active');
      }

      let is_empty = this._n_windows === 0;
      if (this._option.static_workspace === true) {
        is_empty ? this._show_static_empty() : this._show_static_non_empty();
      } else {
        is_empty ? this._show_dynamic_empty() : this._show_dynamic_non_empty();
      }
    }

    _show_static_empty() {
      this.set_child(this._child.get_text());
      this.add_style_class_name('empty');
    }

    _show_static_non_empty() {
      this._set_non_empty_indicator();
      this.remove_style_class_name('empty');
    }

    _show_dynamic_empty() {
      if (this._active === false) {
        this.hide();
      } else {
        // Active window acts the same as it is non empty.
        this._show_dynamic_non_empty();
      }
    }

    _show_dynamic_non_empty() {
      this._set_non_empty_indicator();
      this.show();
    }

    // Set text or icon based on option.
    _set_non_empty_indicator() {
      if (this._option.show_icon === true) {
        this.set_child(this._child.get_icon_or_text());
      } else {
        this.set_child(this._child.get_text());
      }
    }
  },
);

const WorkspaceIndicatorPanelButton = GObject.registerClass(
  class WorkspaceIndicatorPanelButton extends PanelMenu.Button {
    _init(indicators) {
      super._init();
      this._indicators = indicators;
      // Labels are overlapped each other with this Button object only.
      // Create a BoxLayout and append indicators to it.
      this._layout = new St.BoxLayout({
        style_class: 'workspace-panel',
      });
      this._indicators.forEach((indicator) => {
        this._layout.add_child(indicator);
      });
      this.add_child(this._layout);

      // Connect to events
      // this._workspaceSwitchedId = workspaceManager.connect_after(
      //   "workspace-switched",
      //   this.add_indicators.bind(this)
      // );
      this._active_workspace_changed = workspace_manager.connect(
        'active-workspace-changed',
        () => {
          const active_workspace_index =
            workspace_manager.get_active_workspace_index();
          this._indicators.forEach((indicator, i) => {
            if (i === active_workspace_index) {
              indicator.set_active(true);
            } else {
              indicator.set_active(false);
            }
          });
        },
      );
    }

    destroy() {
      // Disconnect all registered events
      this._indicators.forEach((indicator) => {
        indicator.destroy();
      });
      // Disconnect all registered events.
      workspace_manager.disconnect(this._active_workspace_changed);
      super.destroy();
    }
  },
);

function create_indicator(_, i) {
  let workspace = workspace_manager.get_workspace_by_index(i);
  return new WorkspaceIndicator(
    `${i + 1}`,
    i === this.active_workspace_index,
    workspace,
    this.option,
  );
}

// gse-workspace-indicator main class
// It creates or destroys PanelMenu.Button.
const WorkspaceIndicatorPanel = class WorkspaceIndicatorPanel {
  constructor() {
    this._panel = null;
    this._settings = new ExtensionSettings();
  }

  enable() {
    // Connect to events
    this._schema_changed = this._settings.schema.connect('changed', () => {
      this.destroy_panel();
      this.create_panel();
    });
    // Create workspace-indicator.
    this.create_panel();
    // Hide activities button.
    if (activities) {
      activities.hide();
    }
  }

  disable() {
    // Disconnect all registered events
    this._settings.schema.disconnect(this._schema_changed);
    // Destroy workspace-indicator.
    this.destroy_panel();
    // Show activities button back.
    if (activities) {
      activities.show();
    }
  }

  // Create workspace-indicator object.
  create_panel() {
    // Get all workspaces and create a panel.
    this._panel = new WorkspaceIndicatorPanelButton(
      Array(workspace_manager.get_n_workspaces())
        .fill(null)
        .map(create_indicator, {
          option: {
            static_workspace: this._settings.get_static_workspace(),
            show_icon: this._settings.get_show_icon(),
          },
          active_workspace_index:
            workspace_manager.get_active_workspace_index(),
        }),
    );
    // Attach to the top bar.
    Main.panel.addToStatusArea('workspace-indicator', this._panel, 0, 'left');
  }

  // Destroy workspace-indicator object.
  destroy_panel() {
    this._panel.destroy();
  }
};

// Gnome Shell 40
function init() {
  return new WorkspaceIndicatorPanel();
}
