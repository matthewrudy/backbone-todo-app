$(function() {
  var channel, pusher;
  window.app || (window.app = {});
  app.Todo = Backbone.Model.extend({
    EMPTY: 'Empty todo...',
    url: function() {
      var id;
      id = this.get('id');
      return app.list_path + (id ? "/items/" + id : '/items') + '.json';
    },
    initialize: function() {
      if (!this.get('shortdesc')) {
        return this.set({
          'shortdesc': this.EMPTY
        });
      }
    },
    toggle: function() {
      return this.save({
        isdone: !this.get('isdone')
      });
    },
    clear: function() {
      this.destroy();
      return this.view.remove();
    }
  });
  app.TodoList = Backbone.Collection.extend({
    model: app.Todo,
    url: function() {
      return app.list_path + '/items.json';
    },
    done: function() {
      return this.filter(function(todo) {
        return todo.get('isdone');
      });
    },
    remaining: function() {
      return this.filter(function(todo) {
        return !todo.get('isdone');
      });
    },
    comparator: function(todo) {
      return todo.get('id');
    },
    add: function(models, options) {
      var model, _i, _len;
      if (_.isArray(models)) {
        for (_i = 0, _len = models.length; _i < _len; _i++) {
          model = models[_i];
          if (model.id && !app.Todos.get(model.id)) {
            this._add(model, options);
          }
        }
      } else {
        if (models.id && !app.Todos.get(models.id)) {
          this._add(models, options);
        }
      }
      return this;
    }
  });
  app.Todos = new app.TodoList;
  app.TodoView = Backbone.View.extend({
    tagName: 'li',
    template: _.template($('#item-template').html()),
    events: {
      'click .check': 'toggleDone',
      'click span.todo-edit': 'edit',
      'click span.todo-destroy': 'clear',
      'keypress .todo-input': 'updateOnEnter'
    },
    initialize: function() {
      _.bindAll(this, 'render', 'close');
      this.model.bind('remove', this.remove);
      this.model.bind('change', this.render);
      return this.model.view = this;
    },
    render: function() {
      var model;
      model = this.model.toJSON();
      $(this.el).html(this.template(model));
      this.setContent();
      return this;
    },
    setContent: function() {
      var shortdesc;
      shortdesc = this.model.get('shortdesc');
      this.$('.todo-content').text(shortdesc);
      this.edit_input = this.$('.todo-input');
      this.edit_input.bind('blur', this.close);
      return this.edit_input.val(shortdesc);
    },
    toggleDone: function() {
      return this.model.toggle();
    },
    edit: function() {
      $(this.el).addClass('editing');
      return this.edit_input.focus();
    },
    close: function() {
      this.model.save({
        shortdesc: this.edit_input.val()
      });
      return $(this.el).removeClass('editing');
    },
    updateOnEnter: function(e) {
      if (e.keyCode === 13) {
        return this.close();
      }
    },
    remove: function() {
      return $(this.el).remove();
    },
    clear: function() {
      return this.model.clear();
    }
  });
  app.AppView = Backbone.View.extend({
    el: $('#todoapp'),
    statsTemplate: _.template($('#stats-template').html()),
    events: {
      'keypress #new-todo': 'createOnEnter',
      'focus #new-todo': 'showTooltip',
      'blur #new-todo': 'hideTooltip',
      'click .todo-clear a': 'clearCompleted',
      'click .title p input': 'selectShareUrl',
      'dblclick .title p input': 'selectShareUrl'
    },
    initialize: function() {
      _.bindAll(this, 'addOne', 'removeOne', 'addAll', 'render', 'showTooltip', 'hideTooltip');
      this.input = this.$('#new-todo');
      this.$('.ui-tooltip-top').hide();
      app.Todos.bind('add', this.addOne);
      app.Todos.bind('remove', this.removeOne);
      app.Todos.bind('refresh', this.addAll);
      app.Todos.bind('all', this.render);
      return app.Todos.fetch();
    },
    render: function() {
      return this.$('#todo-stats').html(this.statsTemplate({
        total: app.Todos.length,
        done: app.Todos.done().length,
        remaining: app.Todos.remaining().length
      }));
    },
    addOne: function(todo) {
      var view;
      view = new app.TodoView({
        model: todo
      });
      return this.$('#todo-list').append(view.render().el);
    },
    removeOne: function(todo) {
      return this.$("#todo-item-" + todo.id).parent('li').remove();
    },
    addAll: function() {
      return app.Todos.each(function(todo) {
        var view;
        view = new app.TodoView({
          model: todo
        });
        return this.$('#todo-list').prepend(view.render().el);
      });
    },
    newAttributes: function() {
      return {
        shortdesc: this.input.val(),
        isdone: false
      };
    },
    createOnEnter: function(e) {
      if (e.keyCode === 13) {
        app.Todos.create(this.newAttributes());
        this.input.val('Adding...').addClass('working');
        return _.delay(function(el) {
          if (el.val() === 'Adding...') {
            return el.val('').blur().removeClass('working');
          }
        }, 1000, this.input);
      }
    },
    clearCompleted: function() {
      _.each(app.Todos.done(), function(todo) {
        return todo.clear();
      });
      return false;
    },
    showTooltip: function(e) {
      var self, tooltip;
      document.title = "Todos";
      tooltip = this.$('.ui-tooltip-top');
      self = this;
      if (this.tooltipTimeout) {
        clearTimeout(this.tooltipTimeout);
      }
      return this.tooltipTimeout = _.delay(function() {
        tooltip.fadeIn(300);
        return self.tooltipTimeout = _.delay(self.hideTooltip, 2400);
      }, 400);
    },
    hideTooltip: function() {
      var tooltip;
      tooltip = this.$('.ui-tooltip-top');
      if (this.tooltipTimeout) {
        clearTimeout(this.tooltipTimeout);
      }
      return tooltip.fadeOut(300);
    },
    selectShareUrl: function(e) {
      return $(e.currentTarget).select();
    }
  });
  window.AppInstance = new app.AppView;
  pusher = new Pusher('511a5abb7486107ce643');
  channel = pusher.subscribe(window.app.list_channel);
  app.TodosBackpusher = new Backpusher(channel, app.Todos);
  app.TodosBackpusher.bind('remote_create', function(model) {
    var count, matches, title;
    title = document.title;
    matches = title.match(/\[(\d+) (\w+)\]/);
    console.log(matches);
    if (matches && matches[2] === 'new') {
      count = parseInt(matches[1], 10);
      return document.title = "Todos [" + (++count) + " new]";
    } else {
      return document.title = 'Todos [1 new]';
    }
  });
  app.TodosBackpusher.bind('remote_update', function(model) {
    var count, matches, title;
    title = document.title;
    matches = title.match(/\[(\d+) (\w+)\]/);
    if (matches && matches[2] === 'updated') {
      count = parseInt(matches[1], 10);
      return document.title = "Todos [" + (++count) + " updated]";
    } else {
      return document.title = 'Todos [1 updated]';
    }
  });
  app.TodosBackpusher.bind('remote_destroy', function(model) {
    var count, matches, title;
    title = document.title;
    matches = title.match(/\[(\d+) (\w+)\]/);
    if (matches && matches[2] === 'removed') {
      count = parseInt(matches[1], 10);
      return document.title = "Todos [" + (++count) + " removed]";
    } else {
      return document.title = 'Todos [1 removed]';
    }
  });
  window.onfocus = function() {
    return setTimeout(function() {
      return document.title = 'Todos';
    }, 2000);
  };
  return document.onfocusin = function() {
    return setTimeout(function() {
      return document.title = 'Todos';
    }, 2000);
  };
});