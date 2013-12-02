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
      , THUMB_COUNT      = 10
      , REFRESH_DURATION = 15 * 60 * 1000
      ;

    // MODELS
    var GramModel = Backbone.Model.extend({
      "defaults": {},
      "initialize": function () {}
    });



    // COLLECTIONS
    var GramCollection = Backbone.Collection.extend({

      "model": GramModel,

      "url": 'https://api.instagram.com/v1/tags/{{tagName}}/media/recent?count=15&client_id={{clientID}}',

      "initialize": function ( models, options ){
        _.extend( this, options );
      },

      "comparator": function ( a, b ) {
        return parseInt( b.get('created_time'), 10 ) - parseInt( a.get('created_time'), 10 );
      },

      "fetch": function ( additionalQueryParams ) {

        var self = this
          , URL  = this.nextUrl || this.url
          ;

        URL = URL.replace('{{tagName}}',  this.tagName  )
                 .replace('{{clientID}}', this.clientID );

        if ( additionalQueryParams )
          URL += additionalQueryParams;

        this.trigger('fetching');
        $.getJSON( URL + '&callback=?')
          .then(function( resp ){

            self.add( resp.data );
            self.trigger('fetched');

            self.nextUrl = URL + '&max_tag_id=' + resp.pagination.next_url.split('&max_tag_id=').pop();
            URBN.Models.controls.trigger('change:page');

            // if there are enough pics for
            // thumbnails return
            if ( self.length >= THUMB_COUNT )
              return; // EXIT

            this.fetch();

          })
        ;
      }
    });

    var GramSubset = Backbone.Collection.extend({

      "model": GramModel,

      "initialize": function ( models, options ){
        // check superset is passed in
        if ( ! options.superset )
          throw new Error('GramSubset expects a superset to be passed in on initialization'); // EXIT

        _.extend( this, options );

        // on super set successfully updated
        this.superset.on('add', _.bind( this.update, this ) );
      },

      "update": function () {
        // instagram doesnt always respond with 15 items
        // so use highest possble multiple of 5 to a max of 15
        this.reset( this.superset.first( Math.min( Math.floor( this.superset.length / 5 ) * 5, 15 ) ) );
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
      "className": 'thumb-item-view',
      "template": _.template( $('#tpl-thumb-item-view').html() ),
      "events": {
        "mouseenter": function ( e ) {
          URBN.Models.controls.set({"index": this.$el.index() });
        },
      }
    });

    var GramListView = Backbone.Marionette.CollectionView.extend({
      "tagName": 'ul',
      "itemView": GramItemView,
      "initialize": function () {

        this.listenTo( URBN.Models.controls, 'change:index', _.bind( this.scrollToIndex, this ) );

        this.collection.on('change',   _.bind( this.render,     this ) );
        this.collection.on('fetching', _.bind( this.isFetching, this ) );
        this.collection.on('fetched',  _.bind( this.hasFetched, this ) );
      },
      "scrollToIndex": function ( index ) {
        var index = URBN.Models.controls.get('index');
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
      "events": {
        "dragstart img": 'dragstart'
      },
      "initialize": function () {
        this.listenTo( URBN.Models.controls, 'change:index', _.bind( this.highlightIndex, this ) );
      },
      "scrollToIndex": function () {},
      "highlightIndex": function () {
        this.$el.children('.highlighted').removeClass('highlighted');
        this.$el.children(':eq(' + URBN.Models.controls.get('index') + ')').addClass('highlighted');
      },
      "dragstart": function ( e ) {
        e.preventDefault();
      }
    });

    // OBJECTS
    URBN.Models.controls = new Backbone.Model({
      "index": 0,
      "page":  0
    });

    URBN.Collections.grams = new GramCollection( null, {
      "tagName":  'freepeople',
      "clientID": '96bb8a35ad884030b1bf55d53a3aecf0'
    });

    URBN.Collections.subset = new GramSubset( null, {
      "superset": URBN.Collections.grams
    });

    URBN.Views.grams = new GramListView({
      "el": '#grams',
      "collection": URBN.Collections.subset
    });

    var GramsControlView = Backbone.View.extend({
      "el": '.gram-gallery-stage .controls',
      "events": {
        "touchstart":        'touchstart',
        "touchcancel":       'touchcancel',
        "click button.prev": 'click_prev',
        "click button.next": 'click_next'
      },
      "initialize": function () {
        this.model.on('change:page',  _.bind( this.change_page,  this ));
        this.model.on('change:index', _.bind( this.change_index, this ));
        this.listenTo( URBN.Views.grams, 'render', _.bind( this.change_index, this ) );
      },
      "click_prev": function ( e ) {
        this.model.set({"index": this.model.get('index') -1 });
      },
      "click_next": function ( e ) {
        this.model.set({"index": this.model.get('index') +1 });
      },
      "touchstart": function ( e ) {

        var self         = this
          , delta        = 0
          , index        = URBN.Models.controls.get('index')
          , height       = this.$el.height()

          , $slider      = URBN.Views.grams.$el

          , size       = URBN.Collections.subset.length
          , maxOffset    = height * ( size -1 ) * -1
          , touchStartY  = e.originalEvent.targetTouches[0].clientY
          , startOffsetY = parseInt( URBN.Views.grams.$el.css('marginTop'), 10 )
          ;

        $slider.addClass('no-css-transition');

        this.$el.on('touchmove', function ( e ) {

          delta = touchStartY - e.originalEvent.targetTouches[0].clientY
          $slider.css('margin-top', Math.min( Math.max( startOffsetY - delta, maxOffset ), 0 ) + 'px' );
        });

        this.$el.on('touchend', function ( e ) {

          self.$el.off('touchmove touchend');
          $slider.removeClass('no-css-transition');

          if ( Math.abs( delta ) < 20 ) {
            URBN.Models.controls.trigger('change:index');
            URBN.Views.grams.$el.children().eq( URBN.Models.controls.get('index') ).toggleClass('selected');
          }
          else if ( delta > 0 && index < size -1 ) {
            URBN.Models.controls.set({"index": index +1 });
          }
          else if ( delta < 0 && index >= 1 ) {
            URBN.Models.controls.set({"index": index -1 });
          }
        });
      },
      "touchcancel": function () {
        this.$el.off('touchmove touchend');
        URBN.Models.controls.trigger('change:index');
      },
      "change_index": function () {

        var index = this.model.get('index')
          , page  = this.model.get('page')
          ;

        if ( index <= 0 && page <= 0 )
          this.$el.addClass('prev-disabled');
        else
          this.$el.removeClass('prev-disabled');

        if ( index < 0 ) {
          this.model.set({"index": THUMB_COUNT -1 });
          this.model.set({"page":  this.model.get('page') -1 });
        }

        if ( index >= URBN.Collections.subset.length ) {
          this.model.set({"index": 0 });
          this.model.set({"page":  this.model.get('page') +1 });
        }
      },
      "change_page": function () {

        var page = this.model.get('page');

        if ( URBN.Collections.grams.length < THUMB_COUNT * ( page +1 ) ) {
          URBN.Collections.grams.fetch();
        }
        else {
          URBN.Collections.subset.reset( URBN.Collections.grams.slice( page * THUMB_COUNT, page * THUMB_COUNT + THUMB_COUNT ) );
        }
      }
    });

    URBN.Views.controls = new GramsControlView({
      "model": URBN.Models.controls
    });

    URBN.Views.thumbs = new ThumbListView({
      "el": '#thumbs',
      "collection": URBN.Collections.subset
    });

    URBN.Collections.grams.fetch();

    // change format size
    $('header button').on('click', function ( e ) {

      // on transition end
      $('#main-content').on("transitionend webkitTransitionEnd oTransitionEnd MSTransitionEnd", function () {
        // off transition end
        $('#main-content').off("transitionend webkitTransitionEnd oTransitionEnd MSTransitionEnd");
        URBN.Views.grams.scrollToIndex();
      });

      $('#main-content').removeClass('small medium large').addClass( $( e.target ).text().toLowerCase() );
      URBN.Views.grams.scrollToIndex();

    });
  }
};

$(document).ready( URBN.init );
