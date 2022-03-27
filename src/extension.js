'use strict';

const { Clutter, GObject, Gtk, Meta, Shell, St } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;

const activities = Main.panel.statusArea.activities;
const workspace_manager = global.workspace_manager;
const AppSystem = Shell.AppSystem.get_default();
const WindowTracker = Shell.WindowTracker.get_default();

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const ExtensionSettings = Me.imports.settings.ExtensionSettings;

// Count windows in the current workspace.
// Applications such as "Plank" which are placed across all workspaces is not
// counted.
const count_windows = function (workspace) {
  return workspace
    .list_windows()
    .filter((window) => window.is_on_all_workspaces() === false).length;
};

// Find the first app which is on the given workspace, and return the icon of that.
const get_first_app_icon = function (workspace) {
  let apps = workspace.list_windows().reduce((accumulator, window) => {
    if (window.is_on_all_workspaces() === false) {
      let app = WindowTracker.get_window_app(window);
      if (app && app.icon !== undefined) {
        accumulator.push(app);
      }
    }
    return accumulator;
  }, []);
  // You can choose one other than apps[0].
  return apps.length > 0 ? apps[0].icon : null;
};

const INDICATOR_STYLE_CSS = `padding: 0 4px;`;

// Contents of a indicator button which holds both St.Text and St.Icon.
const WorkspaceIndicatorChild = class WorkspaceIndicatorChild {
  constructor(label, workspace, active, show_icon) {
    this._workspace = workspace;
    this._active = active;
    this._show_icon = show_icon;

    this._text = new St.Label({
      text: label,
      x_align: Clutter.ActorAlign.CENTER,
      y_align: Clutter.ActorAlign.CENTER,
      style: 'padding: 2 6px;',
    });
    this._icon = new St.Icon({
      icon_size: 22,
      x_align: Clutter.ActorAlign.CENTER,
      y_align: Clutter.ActorAlign.CENTER,
      style: "margins: 6px"
    });
  }
  
  get active() {
    return this._active;
  }
  
  set active(value) {
    this._active = value;
  }

  destroy() {
    this._icon.destroy();
    this._text.destroy();
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
};

// A Button that indicates the current state of a workspace.
const WorkspaceIndicator = GObject.registerClass(
  class WorkspaceIndicator extends St.Button {
    _init(label, active, workspace, option) {
      super._init({
        style: INDICATOR_STYLE_CSS,
      });
      this._workspace = workspace;
      this._option = option;
      this._child = new WorkspaceIndicatorChild(label, workspace, active);
      // Connect to events to listen.
      this._connect();
    }

    destroy() {
      this._child.destroy();
      // Disconnect all registered events.
      this._disconnect();
      super.destroy();
    }

    // Display indicator based on its state.
    render() {
      let is_empty = count_windows(this._workspace) === 0;
      if (this._option.static_workspace === true) {
        is_empty ? this._show_static_empty() : this._show_static_non_empty();
      } else {
        is_empty ? this._show_dynamic_empty() : this._show_dynamic_non_empty();
      }
      this._set_indicator_style(is_empty);
    }

    set active(value) {
      this.child._active = value;
    }

    get active() {
      return this.child._active;
    }

    _connect() {
      this._window_added = this._workspace.connect(
        'window-added',
        (workspace, window) => {
          this._window_added_event(workspace, window);
        },
      );
      this._window_removed = this._workspace.connect(
        'window-removed',
        (workspace, window) => {
          this._window_removed_event(workspace, window);
        },
      );
      this._clicked = this.connect('clicked', () => {
        this._clicked_event();
      });
      // this._enter_event = this.connect('enter-event', (_widget) => {
      //   // this.set_style(`${INDICATOR_STYLE_CSS}; color: #00ff00;`);
      // });
      // this._leave_event = this.connect('leave-event', (_widget) => {
      //   // this.set_style(`${INDICATOR_STYLE_CSS};`);
      // });
    }

    _disconnect() {
      this._workspace.disconnect(this._window_added);
      this._workspace.disconnect(this._window_removed);
      this.disconnect(this._clicked);
      // this.disconnect(this._enter_event);
      // this.disconnect(this._leave_event);
    }

    _window_added_event(_workspace, window) {
      // Move a window based on rules.
      // A newly create app does not have "compositor_private" property. (¯\_(ツ)_/¯ god knows why)
      if (
        window.is_on_all_workspaces() === false &&
        window.get_compositor_private() === null
      ) {
        const app = AppSystem.lookup_desktop_wmclass(window.get_wm_class());
        if (app) {
          const workspace_index = this._option.window_rule.get(app.get_id());
          // FIXME: index might be not valid, because the number of workspace is not large.
          if (workspace_index !== undefined) {
            window.change_workspace_by_index(workspace_index - 1, false);
          }
        }
      }

      // if (window.get_window_type() === Meta.WindowType.Normal) {
      this.render();
      // }
    }

    _window_removed_event(_workspace, window) {
      // if (window.get_window_type() === Meta.WindowType.Normal) {
      this.render();
      // }
    }

    _clicked_event() {
      this._workspace.activate(global.get_current_time());
    }

    _set_indicator_style(empty) {
      let style = `${INDICATOR_STYLE_CSS}`;
      const color = this._option.indicator_color.to_string();
      if (this._active) {
        style += `border: solid 1px ${color};`;
      }
      if (empty === false) {
        style += `color: ${color};`;
      }
      this.set_style(style);
    }

    _show_static_empty() {
      this.set_child(this._child.get_text());
    }

    _show_static_non_empty() {
      this._set_non_empty_indicator();
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

// A panel that holds and manages all indicators.
const WorkspaceIndicatorPanelButton = GObject.registerClass(
  class WorkspaceIndicatorPanelButton extends PanelMenu.Button {
    _init(indicators) {
      super._init();
      this._indicators = indicators;
      // Labels are overlapped each other with this Button object only.
      // Create a BoxLayout and append indicators to it.
      this._layout = new St.BoxLayout();
      this._indicators.forEach((indicator) => {
        this._layout.add_child(indicator);
        indicator.render();
      });
      this.add_child(this._layout);
      // Connect to events
      this._connect();
    }

    destroy() {
      // Disconnect all registered events
      this._indicators.forEach((indicator) => {
        indicator.destroy();
      });
      // Disconnect all registered events.
      this._disconnect();
      super.destroy();
    }

    _connect() {
      this._active_workspace_changed = workspace_manager.connect_after(
        'active-workspace-changed',
        () => {
          this._update_indicator();
        },
      );
      this._workspace_switched = workspace_manager.connect_after(
        'workspace-switched',
        () => {
          this._update_indicator();
        },
      );
      this._workspace_added = workspace_manager.connect_after(
        'workspace-added',
        () => {
          this._update_indicator();
        },
      );
      this._workspace_removed = workspace_manager.connect_after(
        'workspace-removed',
        () => {
          this._update_indicator();
        },
      );
    }

    _disconnect() {
      workspace_manager.disconnect(this._active_workspace_changed);
      workspace_manager.disconnect(this._workspace_switched);
      workspace_manager.disconnect(this._workspace_added);
      workspace_manager.disconnect(this._workspace_removed);
    }

    // Set a new active workspace whenever workspace-related event is fired.
    _update_indicator() {
      const active_workspace_index =
        workspace_manager.get_active_workspace_index();
      this._indicators.forEach((indicator, i) => {
        indicator.active = (i === active_workspace_index); 
        indicator.render();
      });
    }
  },
);

// gse-workspace-indicator main class
// It creates or destroys PanelMenu.Button.
const WorkspaceIndicatorPanel = class WorkspaceIndicatorPanel {
  constructor() {
    this._panel = null;
    this._settings = new ExtensionSettings();
  }

  enable() {
    // Connect to events
    this._connect();
    // Create workspace-indicator.
    this._create_panel();
    // Hide activities button.
    if (activities) {
      activities.hide();
    }
  }

  disable() {
    // Disconnect all registered events
    this._disconnect();
    // Destroy workspace-indicator.
    this._destroy_panel();
    // Show activities button back.
    if (activities) {
      activities.show();
    }
  }

  _connect() {
    this._schema_changed = this._settings.schema.connect('changed', () => {
      this._destroy_panel();
      this._create_panel();
    });
  }

  _disconnect() {
    this._settings.schema.disconnect(this._schema_changed);
  }

  // Create workspace-indicator object.
  _create_panel() {
    // Get all workspaces and create a panel.
    const window_rule = new Map(
      this._settings.window_rule.map((rule) => rule.split(',')),
    );
    const color = this._settings.indicator_color;
    const active_workspace_index = workspace_manager.get_active_workspace_index();

    this._panel = new WorkspaceIndicatorPanelButton(
      Array(workspace_manager.get_n_workspaces())
        .fill(null)
        .map((_, index) => {
          const workspace = workspace_manager.get_workspace_by_index(index);
          const option = {
            static_workspace: this._settings.static_workspace,
            show_icon: this._settings.show_icon,
            indicator_color: color,
            window_rule: window_rule,
          };
          return new WorkspaceIndicator(
            `${index + 1}`,
            index === active_workspace_index,
            workspace,
            option,
          );
        }),
    );
    // Attach to the top bar.
    Main.panel.addToStatusArea('workspace-indicator', this._panel, 0, 'left');
  }

  // Destroy workspace-indicator object.
  _destroy_panel() {
    this._panel.destroy();
  }
};

// Gnome Shell 40
function init() {
  return new WorkspaceIndicatorPanel();
}
