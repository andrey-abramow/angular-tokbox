/*!
 *  opentok-angular (https://github.com/aullman/OpenTok-Angular)
 *
 *  Angular module for OpenTok
 *
 *  @Author: Adam Ullman (http://github.com/aullman)
 *  @Copyright (c) 2014 Adam Ullman
 *  @License: Released under the MIT license (http://opensource.org/licenses/MIT)
 **/

if (!window.TB) throw new Error('You must include the TB library before the TB_Angular library');

angular.module('opentok', [])
  .constant('TB', window.TB)
  .provider('OTConfig', function () {
    var _apiKey;
    return {
      setKey: function (value) {
        _apiKey = value;
      },
      $get: function () {
        return {
          apiKey: _apiKey
        };
      }
    };
  })
  .factory('OTSession', ['TB', '$rootScope', '$q', 'OTConfig',
    function (TB, $rootScope, $q, OTConfig) {
      if (!OTConfig.apiKey) throw new Error('You need to specify api key');

      var OTSession = {
        streams: [],
        connections: [],
        publishers: [],
        init: function (sessionId, token) {
          this.session = TB.initSession(sessionId);

          OTSession.session.on({
            sessionConnected: function () {
              OTSession.publishers.forEach(function (publisher) {
                OTSession.session.publish(publisher);
              });
            },
            streamCreated: function (event) {
              $rootScope.$apply(function () {
                OTSession.streams.push(event.stream);
              });
            },
            streamDestroyed: function (event) {
              $rootScope.$apply(function () {
                OTSession.streams.splice(OTSession.streams.indexOf(event.stream), 1);
              });
            },
            sessionDisconnected: function () {
              $rootScope.$apply(function () {
                OTSession.streams.splice(0, OTSession.streams.length);
              });
            },
            connectionCreated: function (event) {
              $rootScope.$apply(function () {
                OTSession.connections.push(event.connection);
              });
            },
            connectionDestroyed: function (event) {
              $rootScope.$apply(function () {
                OTSession.connections.splice(OTSession.connections.indexOf(event.connection), 1);
              });
            }
          });
          OTSession.trigger('init');
          return $q(function (resolve, reject) {
            OTSession.session.connect(OTConfig.apiKey, token, function (err) {
              if (err) return reject(err);
              resolve(OTSession.session);
            });
          });
        },
        isSessionConnected: function () {
          return this.session && (this.session.connected ||
            (this.session.isConnected && this.session.isConnected()));
        }
      };
      TB.$.eventing(OTSession);
      return OTSession;
    }
  ])
  .directive('otLayout', ['$window', '$parse', 'TB', 'OTSession',
    function ($window, $parse, TB, OTSession) {
      return {
        restrict: 'E',
        link: function (scope, element, attrs) {
          var props = $parse(attrs.props)();
          var container = TB.initLayoutContainer(element[0], props);
          var layout = function () {
            container.layout();
            scope.$emit('otLayoutComplete');
          };
          scope.$watch(function () {
            return element.children().length;
          }, layout);
          $window.addEventListener('resize', layout);
          scope.$on('otLayout', layout);
          var listenForStreamChange = function listenForStreamChange() {
            OTSession.session.on('streamPropertyChanged', function (event) {
              if (event.changedProperty === 'videoDimensions') layout();
            });
          };
          if (OTSession.session) return listenForStreamChange();
          OTSession.on('init', listenForStreamChange);
        }
      };
    }
  ])
  .directive('otPublisher', ['OTSession', 'TB', 'OTConfig',
    function (OTSession, TB, OTConfig) {
      return {
        restrict: 'E',
        scope: {
          props: '&'
        },
        link: function (scope, element) {
          var props = scope.props() || {};
          props.width = props.width ? props.width : angular.element(element).width();
          props.height = props.height ? props.height : angular.element(element).height();
          var oldChildren = angular.element(element).children();
          scope.publisher = TB.initPublisher(OTConfig.apikey, element[0], props, function (err) {
            if (err) scope.$emit('otPublisherError', err, scope.publisher);
          });
          // Make transcluding work manually by putting the children back in there
          angular.element(element).append(oldChildren);
          scope.publisher.on({
            accessDenied: function () {
              scope.$emit('otAccessDenied');
            },
            accessDialogOpened: function () {
              scope.$emit('otAccessDialogOpened');
            },
            accessDialogClosed: function () {
              scope.$emit('otAccessDialogClosed');
            },
            accessAllowed: function () {
              angular.element(element).addClass('allowed');
              scope.$emit('otAccessAllowed');
            },
            loaded: function () {
              scope.$emit('otLayout');
            },
            streamCreated: function () {
              scope.$emit('otStreamCreated');
            },
            streamDestroyed: function () {
              scope.$emit('otStreamDestroyed');
            }
          });
          scope.$on('$destroy', function () {
            if (OTSession.session) OTSession.session.unpublish(scope.publisher);
            else scope.publisher.destroy();
            OTSession.publishers = OTSession.publishers.filter(function (publisher) {
              return publisher !== scope.publisher;
            });
            scope.publisher = null;
          });
          if (OTSession.isSessionConnected()) {
            OTSession.session.publish(scope.publisher, function (err) {
              if (err) scope.$emit('otPublisherError', err, scope.publisher);
            });
          }
          OTSession.publishers.push(scope.publisher);
        }
      };
    }
  ])
  .directive('otSubscriber', ['OTSession',
    function (OTSession) {
      return {
        restrict: 'E',
        scope: {
          stream: '=',
          props: '&'
        },
        link: function (scope, element) {
          var stream = scope.stream,
            props = scope.props() || {};
          props.width = props.width ? props.width : angular.element(element).width();
          props.height = props.height ? props.height : angular.element(element).height();
          var oldChildren = angular.element(element).children();
          var subscriber = OTSession.session.subscribe(stream, element[0], props, function (err) {
            if (err) scope.$emit('otSubscriberError', err, subscriber);
          });
          subscriber.on('loaded', function () {
            scope.$emit('otLayout');
          });
          // Make transcluding work manually by putting the children back in there
          angular.element(element).append(oldChildren);
          scope.$on('$destroy', function () {
            OTSession.session.unsubscribe(subscriber);
          });
        }
      };
    }
  ]);
