(function(window, document, undefined){
	'use strict';

	var loading = angular.module('loading', ['ngAnimate']);

	loading.run(['$templateCache', function($templateCache){
		$templateCache.put('loading.tpl.html', '<div class="loading-container"><h4 class="loading-title" ng-bind="title"></h4><div class="loading-body" ng-bind="content"></div></div>');
	}]);

	loading.provider('$loading', function(){
		var defaults = this.defaults = {
			animation: 'am-fade',
			backdropAnimation: 'am-fade',
			prefixClass: 'loading',
			prefixEvent: 'loading',
			template: 'loading.tpl.html',
			contentTemplate: false,
			container: false,
			element: null,
			backdrop: false,
			html: false,
			show: false,
			closable: false,
		};

		this.$get = ['$window', '$rootScope', '$templateCache', '$sce', '$compile', '$timeout', '$q', '$http', '$animate', function($window, $rootScope, $templateCache, $sce, $compile, $timeout, $q, $http, $animate){
			var forEach = angular.forEach,
				trim = String.prototype.trim,
				requestAnimationFrame = $window.requestAnimationFrame || $window.setTimeout,
				//bodyElement = angular.element($window.document.body),
				htmlReplaceRegExp = /ng-bind="/ig,
				backdropClass = '-backdrop';

			function loadingFactory(config){
				
				var $loading = {},
					options = $loading.$options = angular.extend({}, defaults, config),
					scope = $loading.$scope = options.scope && options.scope.$new() || $rootScope.$new(),
					parent,
					after,
					modalLinker, 
					modalElement,
					backdropElement;
				
				$loading.$promise = fetchTemplate(options.template);
			
				if(!options.element && !options.container){
					options.container = 'body';
				}

				if(options.container !== 'body'){
					backdropClass = '-backdrop-inline';
				}

				// Support scope as string options
				forEach(['title', 'content'], function(key) {
					if(options[key]) {
						scope[key] = $sce.trustAsHtml(options[key]);
					}
				});

				if(angular.isElement(options.container)) {
					parent = options.container;
				} else {
					parent = options.container ? findElement(options.container) : null;
				}
				
				after = options.container ? null : options.element;

				// Provide scope helpers
				scope.$hide = function() {
					scope.$$postDigest(function() {
						$loading.hide();
					});
				};
				scope.$show = function() {
					scope.$$postDigest(function() {
						$loading.show();
					});
				};
				scope.$toggle = function() {
					scope.$$postDigest(function() {
						$loading.toggle();
					});
				};
				scope.$update = function(object) {
					scope.$$postDigest(function() {
						$loading.update(object);
					});
				};

				 // Support contentTemplate option
				if(options.contentTemplate) {
					$loading.$promise = $loading.$promise.then(function(template) {
						var templateEl = angular.element(template);
						return fetchTemplate(options.contentTemplate)
								.then(function(contentTemplate) {
									var contentEl = findElement('[ng-bind="content"]', templateEl[0]).removeAttr('ng-bind').html(contentTemplate);
									return templateEl[0].outerHTML;
								});
					});
				}
				// Fetch, compile then initialize modal
				backdropElement = angular.element('<div class="' + options.prefixClass + backdropClass + '"/>');

				$loading.$promise.then(function(template) {
					if(angular.isObject(template)) {
						template = template.data;
					}
					if(options.html) {
						template = template.replace(htmlReplaceRegExp, 'ng-bind-html="');
					}

					template = trim.apply(template);
					modalLinker = $compile(template);
					$loading.init();
				});

				$loading.init = function() {
					// Options: show
					if(options.show) {
						scope.$$postDigest(function() {
							$loading.show();
						});
					}
				};

				$loading.destroy = function() {
					// Remove element
					if(modalElement) {
						modalElement.remove();
						modalElement = null;
					}
					if(backdropElement) {
						backdropElement.remove();
						backdropElement = null;
					}
					// Destroy scope
					scope.$destroy();
				};

				$loading.show = function() {
					if(scope.$isShown) return;
					
					if(scope.$emit(options.prefixEvent + '.show.before', $loading).defaultPrevented) {
						return;
					}
					
					// Fetch a cloned element linked from template
					modalElement = $loading.$element = modalLinker(scope, function(clonedElement, scope) {});
					
					// Set the initial positioning.
					modalElement.css({display: 'block'});
					
					// Options: animation
					if(options.animation) {
						if(options.backdrop) {
							backdropElement.addClass(options.backdropAnimation);
						}
						modalElement.addClass(options.animation);
					}

					if(options.backdrop) {
						$animate.enter(backdropElement, parent, null);
					}

					// Support v1.3+ $animate
					// https://github.com/angular/angular.js/commit/bf0f5502b1bbfddc5cdd2f138efd9188b8c652a9
					var promise = $animate.enter(modalElement, parent, after, enterAnimateCallback);
					if(promise && promise.then) promise.then(enterAnimateCallback);
					
					scope.$isShown = true;
					scope.$$phase || (scope.$root && scope.$root.$$phase) || scope.$digest();
					
					// Focus once the enter-animation has started
					// Weird PhantomJS bug hack
					var el = modalElement[0];
					requestAnimationFrame(function() {
						el.focus();
					});

					//bodyElement.addClass(options.prefixClass + '-open');
					parent.addClass(options.prefixClass + '-open');

					if(options.animation) {
						//bodyElement.addClass(options.prefixClass + '-with-' + options.animation);
						parent.addClass(options.prefixClass + '-with-' + options.animation);
					}

					// Bind events
					if(options.backdrop && options.closable) {
						modalElement.on('click', hideOnBackdropClick);
						backdropElement.on('click', hideOnBackdropClick);
					}
				};

				$loading.hide = function() {
					if(!scope.$isShown) {
						return;
					}
					if(scope.$emit(options.prefixEvent + '.hide.before', $loading).defaultPrevented) {
						return;
					}
					var promise = $animate.leave(modalElement, leaveAnimateCallback);
					
					// Support v1.3+ $animate
					// https://github.com/angular/angular.js/commit/bf0f5502b1bbfddc5cdd2f138efd9188b8c652a9
					if(promise && promise.then) {
						promise.then(leaveAnimateCallback);
					}
					if(options.backdrop) {
						$animate.leave(backdropElement);
					}
					scope.$isShown = false;
					scope.$$phase || (scope.$root && scope.$root.$$phase) || scope.$digest();
					
					// Unbind events
					if(options.backdrop && options.closable) {
						modalElement.off('click', hideOnBackdropClick);
						backdropElement.off('click', hideOnBackdropClick);
					}
				};

				$loading.toggle = function() {
					scope.$isShown ? $loading.hide() : $loading.show();
				};

				$loading.focus = function() {
					modalElement[0].focus();
				};

				$loading.update = function(object) {
					if(modalElement){
						options = $loading.$options = angular.extend({}, options, object);
						forEach(['title', 'content'], function(key) {
							if(options[key]) {
								scope[key] = $sce.trustAsHtml(options[key]);
							}
						});
					}
				};				

				// Private methods
				function enterAnimateCallback() {
					scope.$emit(options.prefixEvent + '.show', $loading);
				}

				function leaveAnimateCallback() {
					scope.$emit(options.prefixEvent + '.hide', $loading);
					parent.removeClass(options.prefixClass + '-open');
					if(options.animation) {
						parent.removeClass(options.prefixClass + '-with-' + options.animation);
					}
				}

				function hideOnBackdropClick(evt) {
					if(evt.target !== evt.currentTarget) {
						return;
					}
					options.backdrop === 'static' ? $loading.focus() : $loading.hide();
				}
				return $loading;
			}

			// Helper functions
			function findElement(query, element){
				return angular.element((element || document).querySelectorAll(query));
			}

			function fetchTemplate(template){
				return $q.when($templateCache.get(template) || $http.get(template))
				.then(function(res){
					if(angular.isObject(res)){
						$templateCache.put(template, res.data);
						return res.data;
					}
					return res;
				});
			}

			return loadingFactory;

		}];

	});

	loading.directive('loading', ['$window', '$sce', '$loading', function($window, $sce, $loading) {
		return {
			restrict: 'EAC',
			scope: true,
			link: function postLink(scope, element, attr, transclusion) {
				// Directive options
				var options = {scope: scope, element: element, show: false};
				
				angular.forEach(['template', 'container', 'backdrop', 'html'], function(key) {
					if(angular.isDefined(attr[key])) {
						options[key] = attr[key];
					}	
				});
				
				// Support scope as data-attrs
				angular.forEach(['title', 'content'], function(key) {
					attr[key] && attr.$observe(key, function(newValue, oldValue) {
						scope[key] = $sce.trustAsHtml(newValue);
					});
				});

				// Support scope as an object
				attr.loading && scope.$watch(attr.loading, function(newValue, oldValue) {
					if(angular.isObject(newValue)) {
						angular.extend(scope, newValue);
					}
					else{
						scope.content = newValue;
					}
				}, true);

				// Initialize loading
				var loading = $loading(options);
				
				// Trigger
				element.on(attr.trigger || 'click', loading.toggle);
				
				// Garbage collection
				scope.$on('$destroy', function() {
					if(loading){
						loading.destroy();
					}	
					options = null;
					loading = null;
				});
			}
		};
	}]);


})(window, document);