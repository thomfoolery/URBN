window.URBN = {

  Models:      {},
  Collections: {},
  Views:       {},
  Routers:     {},

  App:         new Backbone.Marionette.Application(),

  isReady:     new $.Deferred(),

  init: function () {
    'use strict';

    // UNDERSCORE templating engine
    _.templateSettings = {
      evaluate : /\{\[([\s\S]+?)\]\}/g,
      interpolate : /\{\{(.+?)\}\}/g // mustache templating style
    };

    var INTERVAL         = 100
      , THUMB_COUNT      = 10
      ;


    // APP INITIALIZERS
    URBN.App.addInitializer( function () {
      URBN.Collections.grams.fetch();
    });

    // unecessary use of deferred/promise
    // to demonstrate knowledge of ansyncronous,
    // and functional programming
    $.when( URBN.isReady )
      .then( function () {

        URBN.App.start()

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
      })
    ;



    // MODELS

    // This model controls which image to showcase
    // and when to fetch more data from the instagram API

    var ControlModel = Backbone.Model.extend({
      "defaults": {
        "index": 0,
        "page":  0
      },
      "initialize": function () {
        this.on('change:index', _.bind( this.change_index, this ));
        this.on('change:page',  _.bind( this.change_page,  this ));
      },
      "change_page": function () {

        var page = URBN.Models.controls.get('page');

        if ( URBN.Collections.grams.length < THUMB_COUNT * ( page +1 ) ) {
          // not enough data
          // fetch more
          URBN.Collections.grams.fetch();
        }
        else {

          var start = page  * THUMB_COUNT
            , end   = start + THUMB_COUNT;

          URBN.Collections.subset.reset( URBN.Collections.grams.slice( start, end ) );
        }
      },
      "change_index": function () {

        var model = URBN.Models.controls
          , index = model.get('index')
          ;

        if ( index < 0 ) {
          model.set({"index": THUMB_COUNT -1 });
          model.set({"page":  model.get('page') -1 });
        }

        if ( index >= URBN.Collections.subset.length ) {
          model.set({"index": 0 });
          model.set({"page":  model.get('page') +1 });
        }
      }
    });



    // COLLECTIONS

    // This collection will store ALL of the instagram objects.
    // It will take care of all fetching, caching & sorting.

    var GramCollection = Backbone.Collection.extend({
      "model": Backbone.Model,
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

            // store the url of the next page of data
            // a little bit of trickery so as to not use the previous jQuery JSONP callback function
            self.nextUrl = URL + '&max_tag_id=' + resp.pagination.next_url.split('&max_tag_id=').pop();

            // trigger page change incase we were fetching data for the next page,
            // otherwise nothing will happen
            URBN.Models.controls.trigger('change:page');

            if ( self.length >= THUMB_COUNT )
              return; // EXIT

            // if there were not enough models to fill the thumbnails section
            // fetch some more
            this.fetch();

          })
        ;
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

    var GramsControlView = Backbone.View.extend({
      "el": '.gram-gallery-stage .controls',
      "events": {
        "touchstart":        'touchstart',
        "touchcancel":       'touchcancel',
        "click button.prev": 'click_prev',
        "click button.next": 'click_next'
      },
      "initialize": function () {
        // this.model.on('change:page',  _.bind( this.change_page,  this ));
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
      }
    });



    // INSTANCES

    // this model controls which image is being featured
    // add which page of thumbnails we are on
    URBN.Models.controls = new ControlModel();

    // Here we have a master collection of instagram object.
    URBN.Collections.grams = new GramCollection( null, {
      "tagName":  'freepeople',
      "clientID": '96bb8a35ad884030b1bf55d53a3aecf0'
    });

    // Here we have a subset collection that we will use to
    // feed the thumb nail view.
    URBN.Collections.subset = new Backbone.Collection();

    // This is the main view
    URBN.Views.grams = new GramListView({
      "el": '#grams',
      "collection": URBN.Collections.subset
    });

    // This is the thumbnail view
    URBN.Views.thumbs = new ThumbListView({
      "el": '#thumbs',
      "collection": URBN.Collections.subset
    });

    // This view controls the main view and the thuimbnail view
    URBN.Views.controls = new GramsControlView({
      "model": URBN.Models.controls
    });



    // URBN is ready
    URBN.isReady.resolve();
  }
};

$(document).ready( URBN.init );
