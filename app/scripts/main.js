window.URBN = {

  Models:      {},
  Collections: {},
  Views:       {},
  Routers:     {},

  App:         new Backbone.Marionette.Application(),

  init: function () {
    'use strict';

// UNDERSCORE templating engine
    _.templateSettings = {
      evaluate : /\{\[([\s\S]+?)\]\}/g,
      interpolate : /\{\{(.+?)\}\}/g // mustache templating style
    };

    var INTERVAL         = 100
      , REFRESH_DURATION = 2 * 60 * 1000
      ;

    // MODELS
    var GramModel = Backbone.Model.extend({
      "defaults": {},
      "initialize": function () {}
    });

    var TimerModel = Backbone.Model.extend({
      "defaults": {
        "start":   null
      },
      "initialize": function () {

        URBN.Collections.grams.fetch();
        this.set({"start": new Date() });
        setTimeout( _.bind( this.increment, this ), INTERVAL );
      },
      "increment": function () {

        if ( new Date() - this.get('start') > REFRESH_DURATION )
          this.reset();

        this.trigger('increment');
        setTimeout( _.bind( this.increment, this ), INTERVAL );
      },
      "reset": function () {

        URBN.Collections.grams.fetch();
        this.set({'start': new Date() });
      }
    });



    // COLLECTIONS
    var GramCollection = Backbone.Collection.extend({

      "model": GramModel,

      "url": 'https://api.instagram.com/v1/tags/{{tagName}}/media/recent?client_id={{clientID}}',

      "initialize": function ( models, options ){
        _.extend( this, options );
      },

      "comparator": function ( a, b ) {
        return parseInt( b.get('created_time'), 10 ) - parseInt( a.get('created_time'), 10 );
      },

      "fetch": function () {

        var self = this
          , URL  = this.url
          ;

        URL = URL.replace('{{tagName}}',  this.tagName  )
                 .replace('{{clientID}}', this.clientID );

        this.trigger('fetching');
        $.getJSON( URL + '&callback=?')
          .then(function( resp ){

            var arr = [];

            _.each( resp.data, function ( value, key ){
              arr.push( new GramModel( value ) );
            });

            self.add( arr );
            self.trigger('fetched');
          })
        ;
      }
    });

    var GramSubset = Backbone.Collection.extend({

      "model": GramModel,

      "initialize": function ( models, options ){
        _.extend( this, options );

        this.superSet.on('fetched', _.bind( this.update, this ) );
      },

      "update": function () {
        this.reset( this.superSet.first( 15 ) )
      }

    });



    // VIEWS
    var GramItemView = Backbone.Marionette.ItemView.extend({
      "tagName": 'li',
      "className": 'gram-item-view',
      "template": _.template( $('#tpl-gram-item-view').html() )
    });

    var ThumbItemView = Backbone.Marionette.ItemView.extend({
      "tagName": 'li',
      "className": 'gram-item-view',
      "template": _.template( $('#tpl-thumb-item-view').html() ),
      "events": {
        "mouseenter": function ( e ) {
          URBN.Views.grams.scrollToIndex( this.$el.index() );
        },
      }
    });

    var GramListView = Backbone.Marionette.CollectionView.extend({
      "tagName": 'ul',
      "itemView": GramItemView,
      "initialize": function () {
        this.collection.on('change',   _.bind( this.render,     this ) );
        this.collection.on('fetching', _.bind( this.isFetching, this ) );
        this.collection.on('fetched',  _.bind( this.hasFetched, this ) );
      },
      "scrollToIndex": function ( index ) {
        this.$el.css({"margin-top": this.$el.height() * index * -1 });
      },
      "isFetching": function () {
        this.$el.addClass('is-fetching');
      },
      "hasFetched": function () {
        this.$el.removeClass('is-fetching');
      }
    });

    var ThumbListView = GramListView.extend({
      "itemView": ThumbItemView,
      "scrollToIndex": function () {}
    });

    var TimerView = Backbone.View.extend({
      "el": "#timer",
      "initialize": function () {
        this.$marker = this.$('.timer-marker');
        this.model.on('increment', _.bind( this.increment, this ) );
      },
      "increment": function () {
        this.$marker.width( (( new Date() - this.model.get('start') ) / REFRESH_DURATION ) * 100 + '%');
      }
    });

    // OBJECTS
    URBN.Collections.grams = new GramCollection( null, {
      "tagName":  'freepeople',
      "clientID": '96bb8a35ad884030b1bf55d53a3aecf0'
    });

    URBN.Collections.subset = new GramSubset( null, {
      "superSet": URBN.Collections.grams
    });

    URBN.Views.timer = new TimerView({
      "model": new TimerModel()
    });

    URBN.Views.grams = new GramListView({
      "el": '#grams',
      "collection": URBN.Collections.subset
    });

    URBN.Views.thumbs = new ThumbListView({
      "el": '#thumbs',
      "collection": URBN.Collections.subset
    });

  }
};

$(document).ready( URBN.init );
