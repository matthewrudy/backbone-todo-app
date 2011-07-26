# coffee -cb public/javascripts/application.coffee
$ ->
  window.app ||= {}

  app.Todo = Backbone.Model.extend
    EMPTY: 'Empty todo...'

    url: ->
      id = this.get('id')
      app.list_path + (if id then "/items/#{id}" else '/items') + '.json'

    initialize: ->
      unless this.get('shortdesc')
        this.set
          shortdesc: this.EMPTY

    toggle: ->
      this.save
        isdone: !this.get('isdone')

    clear: ->
      this.destroy()
      this.view.remove()

  app.TodoList = Backbone.Collection.extend
    model: app.Todo
  
    url: ->
     app.list_path + '/items.json'

    done: ->
      this.filter (todo) ->
        todo.get('isdone')

    remaining: ->
      this.filter (todo) ->
        !todo.get('isdone')

    comparator: (todo) ->
      todo.get('id')

    # This method is overridden to save us messing around
    # with socket_id filtering.
    add: (models, options) ->
      unless _.isArray(models)
        models = [models]
      
      for model in models
        if model.id and !app.Todos.get(model.id)
          this._add(model, options)
      this

  app.Todos = new app.TodoList

  app.TodoView = Backbone.View.extend
    tagName: 'li'
  
    template: _.template $('#item-template').html()

    events:
      'click .check':               'toggleDone'
      'click span.todo-edit':       'edit'
      'click span.todo-destroy':    'clear'
      'keypress .todo-input':       'updateOnEnter'

    initialize: ->
      _.bindAll(this, 'render', 'close')
      this.model.bind('remove', this.remove)
      this.model.bind('change', this.render)
      this.model.view = this

    render: ->
      model = this.model.toJSON()
      $(this.el).html(this.template(model))
      this.setContent()
      this

    setContent: ->
      shortdesc = this.model.get('shortdesc')
      this.$('.todo-content').text(shortdesc)
      this.edit_input = this.$('.todo-input')
      this.edit_input.bind('blur', this.close)
      this.edit_input.val(shortdesc)

    toggleDone: ->
      this.model.toggle()

    edit: ->
      $(this.el).addClass('editing')
      this.edit_input.focus()

    close: ->
      this.model.save
        shortdesc: this.edit_input.val()
      $(this.el).removeClass('editing')

    updateOnEnter: (e) ->
      if e.keyCode == 13
        this.close()

    remove: ->
      $(this.el).remove()

    clear: ->
      this.model.clear()

  app.AppView = Backbone.View.extend
    el: $('#todoapp')
  
    statsTemplate: _.template $('#stats-template').html()

    events:
      'keypress #new-todo':      'createOnEnter'
      'focus #new-todo':         'showTooltip'
      'blur #new-todo':          'hideTooltip'
      'click .todo-clear a':     'clearCompleted'
      'click .title p input':    'selectShareUrl'
      'dblclick .title p input': 'selectShareUrl'

    initialize: ->
      _.bindAll(this, 'addOne', 'removeOne', 'addAll', 'render', 'showTooltip', 'hideTooltip')

      this.input = this.$('#new-todo')

      this.$('.ui-tooltip-top').hide()

      app.Todos.bind('add', this.addOne)
      app.Todos.bind('remove', this.removeOne)
      app.Todos.bind('refresh', this.addAll)
      app.Todos.bind('all', this.render)

      app.Todos.fetch()

    render: ->
      this.$('#todo-stats').html this.statsTemplate
        total: app.Todos.length
        done: app.Todos.done().length
        remaining: app.Todos.remaining().length

    addOne: (todo) ->
      view = new app.TodoView(model: todo)
      this.$('#todo-list').append(view.render().el)
    
    removeOne: (todo) ->
      this.$("#todo-item-" + todo.id).parent('li').remove()

    addAll: ->
      app.Todos.each (todo) ->
        view = new app.TodoView(model: todo)
        this.$('#todo-list').prepend(view.render().el)

    newAttributes: ->
      shortdesc: this.input.val()
      isdone: false

    createOnEnter: (e) ->
      if e.keyCode == 13
        app.Todos.create(this.newAttributes())
        this.input.val('Adding...').addClass('working')
        _.delay (el) ->
          if el.val() == 'Adding...'
            el.val('').blur().removeClass('working')
        , 1000, this.input
      
    clearCompleted: ->
      _.each app.Todos.done(), (todo) ->
        todo.clear()
        
      false

    showTooltip: (e) ->
      document.title = "Todos"

      tooltip = this.$('.ui-tooltip-top')
      self = this

      if this.tooltipTimeout
        clearTimeout(this.tooltipTimeout)

      this.tooltipTimeout = _.delay ->
        tooltip.fadeIn(300)
        self.tooltipTimeout = _.delay(self.hideTooltip, 2400)
      , 400
    
    hideTooltip: ->
      tooltip = this.$('.ui-tooltip-top')
      if this.tooltipTimeout
        clearTimeout(this.tooltipTimeout)

      tooltip.fadeOut(300)
  
    selectShareUrl: (e) ->
      $(e.currentTarget).select()

  window.AppInstance = new app.AppView

  pusher = new Pusher('511a5abb7486107ce643')
  channel = pusher.subscribe(window.app.list_channel)

  app.TodosBackpusher = new Backpusher(channel, app.Todos)

  app.TodosBackpusher.bind 'remote_create', (model) ->
    title = document.title
    matches = title.match(/\[(\d+) (\w+)\]/)

    console.log(matches)

    if matches && matches[2] == 'new'
      count = parseInt(matches[1], 10)
      document.title = "Todos [#{++count} new]"
    else
      document.title = 'Todos [1 new]'

  app.TodosBackpusher.bind 'remote_update', (model) ->
    title = document.title
    matches = title.match(/\[(\d+) (\w+)\]/)

    if matches && matches[2] == 'updated'
      count = parseInt(matches[1], 10)
      document.title = "Todos [#{++count} updated]"
    else
      document.title = 'Todos [1 updated]'

  app.TodosBackpusher.bind 'remote_destroy', (model) ->
    title = document.title
    matches = title.match(/\[(\d+) (\w+)\]/)

    if matches && matches[2] == 'removed'
      count = parseInt(matches[1], 10)
      document.title = "Todos [#{++count} removed]"
    else
      document.title = 'Todos [1 removed]'

  window.onfocus = ->
    setTimeout ->
      document.title = 'Todos'
    , 2000

  document.onfocusin = ->
    setTimeout ->
      document.title = 'Todos'
    , 2000
