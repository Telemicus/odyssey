/**
TODO: Need to create code snippet that can capture errors or start other listeners earlier then the tag loads.
**/ 
"use strict";
(function (w, d) {
    //_ODSY already exists which means we've already instantiated the tag.
    if(w.hasOwnProperty("_ODSY")){
        console.log("Odyssey already initialized");
        return false;
    }

    /**
     * Base object that gives meta data and determines what is enabled/disabled
     */
    w._ODSY = {
        //If set to true, we already ran the tag so don't run it again.
        initialized: false,

        //Current version of the tag
        version: "0.1",
        
        //Setting debug to true turns on more `console.logs()`
        debug: false,
        
        //TODO: Create example beacon endpoint
        //Beacon endpoint URL - this is where the data gets sent via `sendBeacon()`
        beaconUrl: "http://localhost/odyssey/beacon.php",
        
        //config contains all the unique configurations that are read by different parts of the tag
        config: {
            //XHR prototype functionality
            xhr: false,
            //Fetch overwrite functionality
            fetch: false,
            //MutationObserver functionality
            mutationObserver: false,
            //long task timing TTI
            ltt_tti: false, 
            //requestAnimationFrame TTI
            fps_tti: false, 
            //Turns on/off resource timings functionality
            resourceTimings: true,
            //Turns on/off page timings functionality
            pageTimings: true,
            //Turns on/off standard error collection
            standardErrors: true,
            //Turns on/off CSP error collection
            cspErrors: false,
        }
    };

    /**
     * Core functionality. Handles launching the beacon and retrieving all the variables
     */
    w._ODSY.core = {
        //Unique permanent identifier
        guid: "",
        
        //Unique session identifier. Lasts as long as the `sessionTimeout`.
        sessionID: "",

        //Session timeout in minutes
        sessionTimeout: 30,

        // Initialize everything as soon as the tag loads
        init: function () {
            this.initialized = true;
            const _utils = _ODSY.utils;
            
            // Set the resource buffer as high as it can go
            performance.setResourceTimingBufferSize(400);

            //Sets the session and guid values. Retrieved from local storage if they exist there.
            this.sessionID = _utils.setVar("sessionID", _utils.generateUUID(), 30);
            this.guid = _utils.setVar("guid", _utils.generateUUID(), 0);

            //Kick off the rest of the tag execution
            this.initImmediateExec();
            this.initLoadEventListener();
            
        },
        
        // Initialize the load event listener to gather the page timings and send back data.
        initLoadEventListener: function () {
            if(d.readyState == 'complete'){
                _ODSY.core.getData();
            }
            else{
                w.addEventListener('load', _ODSY.core.getData);
            }
            
        },

        // Initializes functions (like PerformanceObservers) that need immediate execution.
        initImmediateExec: function () {
            let _o = _ODSY;
            _o.webVitals.init();
            _o.errors.init();
            _o.nativeOverwrites.init();
            // this.tti.init();
            // this.SPA.init();
            
        },
        
        // Retrieves the data needed after the load event 
        getData: function () {
            // This delays the data being sent to make sure everything has been captured.
            // This methodology needs refinement, but I'll come back to it.
            let dataDelay = 3000;
            setTimeout(function () {
                var _o = _ODSY;
                _o.config.pageTimings === true && _o.pageTimings.init();
                _o.core.sendBeacon("page");
                _o.config.resourceTimings === true && _o.resourceTimings.init();
            }, dataDelay);

        },

        /**
         * Builds the data set that will be delivered to the endpoint
         * @param {string} beaconType - Supports "page", "resource", and "error" currently. 
         * @returns {object}
         */
        buildData: function(beaconType) {
            const _o = _ODSY;
            const _core = _o.core;
            const _pt = _o.pageTimings;
            const _wv = _o.webVitals;
            
            let beaconData = {
                dataType: beaconType,
                guid: _core.guid,
                sessionID: _core.sessionID,
                navigationStart: _pt.navStartEpoch,
                data: {},
                filters: {}
            };

            if(beaconType === "page"){
                beaconData.data = {
                    navTimings: _pt.perfNavTiming,
                    navStart: _pt.navStartEpoch,
                    fcp: _pt.fcp,
                    fp: _pt.fp,
                    lcp: _wv.lcp,
                    fid: _wv.fid,
                    cls: _wv.cls
                };
            }
            else if(beaconType === "resource"){
                const _rt = _o.resourceTimings;
                beaconData.data = _rt.entries;
            }
            else if(beaconType === "error"){
                const _err = _o.errors;
                beaconData.data = _err.entries;
            }

            return beaconData;
        },

        //Sends the data back via `navigator.sendBeacon()`
        sendBeacon: function (beaconType) {
            let data = this.buildData(beaconType);
            _ODSY.debug === true && console.log(data);
            navigator.sendBeacon(_ODSY.beaconUrl, JSON.stringify(data));
        }
    };

    /**
     * Series of helper functions that can be used in a variety of circumstances.
     */
    w._ODSY.utils = {
        /**
         * Returns the epoch seconds for the now time
         * @returns {number} 
         */
        nowTime: function(){
            return new Date().getTime();
        },

        /**
         * Generates a UUID
         * https://stackoverflow.com/questions/105034/how-do-i-create-a-guid-uuid/2117523#2117523
         * https://en.wikipedia.org/wiki/Universally_unique_identifier
         * @returns {string} - Returns a UUID
         */
        generateUUID: function(){
            return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
                (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
            );
        },

        /**
         * Get from localStorage if the value is stored there.
         * Needed for session variables or other session level storage needs.
         * 
         * @param {string} key - Local Storage key.
         * @param {boolean} [json=true] - Determines if the value is stored in JSON or as a standard string so that we can expire the data.
         * @returns {string|null} localStorage value
         */
        getLS: function(key, json = true){
            let returnVal = null;
            let lsGet = localStorage.getItem(key);
            if (lsGet !== null) {
                if (json == true) {
                    try {
                        var jsonObj = JSON.parse(lsGet);
                        if(jsonObj.hasOwnProperty('expires')) {
                            if (jsonObj.expires > this.nowTime()) {
                                returnVal = jsonObj.value;
                            }
                        }
                        else{
                            returnVal = jsonObj.value;
                        }
                    } 
                    catch (e) {
                        console.log(e);
                        returnVal = lsGet;
                    }
                } 
                else {
                    returnVal = lsGet;
                }
            }
            return returnVal;
        },

        /**
         * Set in localStorage
         * @param {string} key - Local storage key.
         * @param {string} value - Local storage value.
         * @param {boolean} [json=true] - Determines whether to use a JSON format or not when storing to localStorage.
         * @param {number} [expireTime=30] - Expire time in minutes. Only applies if the json argument is set to true. Setting expireTime to 0 is the same as not having an expireTime.
         */
        setLS: function(key, value, json = true, expireTime = 30){
            try{
                if(json === true){
                    let expireSeconds = this.nowTime() + (expireTime * 60 * 60);
                    let jsonObj = {value: value};
                    if(expireTime > 0){
                        jsonObj.expires = expireSeconds;
                    }
                    value = JSON.stringify(jsonObj);
                }
                localStorage.setItem(key, value);
            }
            catch(e){
                console.log(e);
            }
        },

        /**
         * 
         * @param {string} key 
         * @param {string} value 
         * @param {number} expire 
         * @returns 
         */
        setVar: function(key, value, expire){
            let getVal = this.getLS(key);
            if(getVal !== null){
                return getVal;
            }
            else{
                this.setLS(key, value, true, expire);
                return value;
            }
        }
    };

    //TODO: Need to determine the format I will use for capturing these variables.
    w._ODSY.filters = {
        //Will retrieve session level filters like AB, datacenter, traffic segment, etc.
        sessionLevel: {},

        //Will retrieve page name, page group, and any other page level filters
        pageLevel: {},

        //SPA configuration for XHR, fetch, MutationObserver, etc.
        spa:{},

        //Will retrieve the custom variables
        custom: {}
    };

    /**
     * Retrieves the nav timings and paint timings
     * https://w3c.github.io/navigation-timing/#sec-PerformanceNavigationTiming
     * https://developer.mozilla.org/en-US/docs/Web/API/Navigation_timing_API
     * 
     * https://www.w3.org/TR/2017/WD-paint-timing-20170907/#sec-PerformancePaintTiming
     * https://developer.mozilla.org/en-US/docs/Web/API/PerformancePaintTiming
     * 
     */
    w._ODSY.pageTimings = {
        // Level 2 Navigation Timings
        perfNavTiming: {},
        // navigationStart from Level 1 spec
        navStartEpoch: 0,
        // First Contentful Paint
        fcp: 0, 
        // First Paint
        fp: 0,

        // Initializes collection of the nav timings and paint timings
        init: function () {
            _ODSY.debug === true && console.log("Capturing page timings");
            //PerformanceNavigationTiming is part of the level 2 spec and should be used for page metrics
            this.getNavTimings();
            this.getPaintTimings();
        },
        
        //Retrieves the Level 2 Navigation Timing data
        getNavTimings: function(){
            try{
                let perf = performance;
                [this.perfNavTiming] = perf.getEntriesByType('navigation');
                this.navStartEpoch = perf.timing.navigationStart;
            }
            catch(e){
                console.log("Nav Timings error");
                console.log(e);
            }
        },

        //Retrieves the Paint Timing data
        getPaintTimings: function () {
            _ODSY.debug === true && console.log("Capturing FCP")
            try {
                //TODO: I should be looping through the entries and assigning based on the name property
                let paintTiming = performance.getEntriesByType('paint');
                this.fp = paintTiming[0].startTime;
                this.fcp = paintTiming[1].startTime;
            }
            catch (e) {
                console.log("Paint Timings error");
                console.log(e);
            }
        },

    };

    /**
     * Retrieves Time to Interactive (TTI) through one of two methods
     * 1. Long Task Timing API - Retrieves long tasks from an API.
     * 2. `requestAnimationFrame()` - Measures the time between frames to determine when long tasks have occurred.
     */
    w._ODSY.tti = {
        init: function () {
            console.log('Initializing TTI PO');
        }
    };

    /**
     * Retrieves the Core Web Vitals (CWV) - https://web.dev/vitals/
     * Largest Contentful Paint (LCP) - https://web.dev/lcp/
     * Cumulative Layout Shift (CLS) - https://web.dev/cls/
     * First Input Delay (FID) - https://web.dev/fid/
     * Total Blocking Time (TBT) - https://web.dev/tbt/ [Technically not a CWV, but still generally categorized with them.]
     */
    w._ODSY.webVitals = {
        //Variables that contain duration
        lcp: 0,
        fid: 0,
        fidStart: 0,
        cls: 0,
        clsStart: 0,
        navigationTimings: {},

        //Logs for reference
        lcpLog: [],
        fidEventLog: [],
        fidLog: [],
        clsLog: [],

        //Initialize all the performance observers
        init: function () {
            this.initLCP();
            this.initFID();
            this.initCLS();
        },

        //TODO: TBT is not technically a web vital so we may we want to classify it elsewhere
        //TODO: Implement total blocking time calculation
        getTBT: function () {
            try {
                return 0;
            }
            catch (e) {
                console.info("Error capturing TBT: ");
                console.log(e);
                return 0
            }
        },

        //Initialize the PerformanceObserver for Largest Contentful Paint
        initLCP: function () {
            var self = this;
            try {
                //TODO: LCP is more advanced then this now. Need to update the logic.
                const po = new PerformanceObserver((entryList, po) => {
                    entryList.getEntries().forEach((entry) => self.updateLCP(entry));
                });

                po.observe({
                    type: 'largest-contentful-paint',
                    buffered: true,
                });

                /*
                const po = new PerformanceObserver(list => {
                    const entries = list.getEntries();
                    self.lcpLog.push(entries);
                    const entry = entries[entries.length - 1];
                    // Process entry as the latest LCP candidate
                    // LCP is accurate when the renderTime is available.
                    // Try to avoid this being false by adding Timing-Allow-Origin headers!
                    const accurateLCP = entry.renderTime ? true : false;
                    // Use startTime as the LCP timestamp. It will be renderTime if available, or loadTime otherwise.
                    const largestPaintTime = entry.startTime;
                    // Send the LCP information for processing.
                    var finalLCP = 0;
                    if(accurateLCP !== false){
                        finalLCP = accurateLCP;
                    }
                    else if(largestPaintTime != 0 && largestPaintTime != false){
                        finalLCP = largestPaintTime;
                    }
                    else{
                        finalLCP = entry.loadTime;
                    }
                    console.log("LCP: "+finalLCP);
                    self.lcpDuration = parseInt(finalLCP);
                    console.log(entries);
                });
                po.observe({type: 'largest-contentful-paint', buffered: true});
                */
            } catch (e) {
                console.log("Error calling LCP:");
                console.log(e);
            }

        },

        //Initialize the PerformanceObserver for First Input Delay
        initFID: function () {
            var self = this;
            try {
                // Create a PerformanceObserver that calls `onFirstInputEntry` for each entry.
                const po = new PerformanceObserver((entryList, po) => {
                    entryList.getEntries().forEach((entry) => self.updateFID(entry, po));
                });

                // Observe entries of type `first-input`, including buffered entries,
                // i.e. entries that occurred before calling `observe()` below.
                po.observe({
                    type: 'first-input',
                    buffered: true,
                });
            }
            catch (e) {
                console.log("Error calling FID:");
                console.log(e);
            }

        },

        //Initialize the PerformanceObserver for Cumulative Layout Shift
        initCLS: function () {
            try {
                var self = this;
                // Create a PerformanceObserver that calls `onLayoutShiftEntry` for each entry.
                const po = new PerformanceObserver((entryList, po) => {
                    entryList.getEntries().forEach((entry) => self.updateCLS(entry));
                });

                // Observe entries of type `layout-shift`, including buffered entries,
                // i.e. entries that occurred before calling `observe()` below.
                po.observe({
                    type: 'layout-shift',
                    buffered: true,
                });
            } catch (e) {
                // Do nothing if the browser doesn't support this API.
                console.log("Error calling CLS:");
                console.log(e);
            }
        },

        updateLCP: function (entry) {
            //TODO: The comments below are here to remind me that this algorithm needs updating.


            // Only include an LCP entry if the page wasn't hidden prior to
            // the entry being dispatched. This typically happens when a page is
            // loaded in a background tab.
            //if (entry.startTime < firstHiddenTime) {
            // NOTE: the `startTime` value is a getter that returns the entry's
            // `renderTime` value, if available, or its `loadTime` value otherwise.
            // The `renderTime` value may not be available if the element is an image
            // that's loaded cross-origin without the `Timing-Allow-Origin` header.
            this.lcp = parseInt(entry.startTime);
            //}
        },

        updateCLS: function (entry) {
            // Only count layout shifts without recent user input.
            if (!entry.hadRecentInput) {
                this.cls += entry.value;
                this.clsStart = parseInt(entry.startTime);
            }
        },

        updateFID: function (entry, po) {
            //TODO: The comments below are here to remind me that this algorithm needs updating.

            // Only report FID if the page wasn't hidden prior to
            // the entry being dispatched. This typically happens when a
            // page is loaded in a background tab.
            //if (entry.startTime < firstHiddenTime) {
            // console.log(entry);
            this.fid = entry.processingStart - entry.startTime;
            this.fidStart = entry.startTime;

            // Disconnect the observer.
            po.disconnect();

            // Report the FID value to an analytics endpoint.
            //sendToAnalytics({fid});
            //}
        }
    };
    
    /**
     * Retrieves and populates the resource timings in a format that can be transmitted.
     * https://www.w3.org/TR/resource-timing-2/
     * 
     */
    w._ODSY.resourceTimings = {
        //Array that stores all the resource entries
        entries: [],

        //Last index sent for the resource entry array
        lastIndex: 0,

        //Total entries found
        log: [],

        //Resource counter to stop after x amount of runs
        resourceCounter:0,

        //interval ID for the beaconHandler()
        intervalID: 0,

        /*
        TODO: Eventually I will need to do a setInterval to regularly capture and then 
        clear the resource buffer when it hits max
        */
        init: function () {
            _ODSY.debug === true && console.log("Capturing resource timings");
            performance.setResourceTimingBufferSize(400);
            this.beaconHandler();
        },

        /**
         * Handler function for sending off the resource data regularly. 
         * This SERIOUSLY needs work, but it's fine for testing.
         */
        beaconHandler: function(){
            let _core = _ODSY.core;
            var handlerInterval = setInterval(function(self){
                if(self.resourceCounter >= 3){
                    clearInterval(handlerInterval);
                }
                self.resourceCounter++;
                let resourceEntries = performance.getEntriesByType('resource');
                self.entries = resourceEntries.slice(self.lastIndex)
                if(self.entries.length === 1 && self.entries[0].name.indexOf('Odyssey') != -1){
                    self.lastIndex = resourceEntries.length - 1;
                    self.entries = [];
                    _ODSY.debug === true && console.log('No new resource entries found');
                    return;
                }
                else{
                    _ODSY.debug === true && console.table(self.entries);
                    _core.sendBeacon("resource");
                    self.lastIndex = resourceEntries.length;
                    self.entries = [];
                }
            }, 10000, this, _core);
        }
    };

    /**
     * Retrieves and stores error reporting from the following
     * Standard errors 
     *      - https://developer.mozilla.org/en-US/docs/Web/API/Window/error_event
     * CSP errors 
     *      - https://developer.mozilla.org/en-US/docs/Web/API/SecurityPolicyViolationEvent
     * XHR/Fetch errors 
     *      - This is handled with the onreadstatechange (XHR) or Promises (fetch) to detect errors
     */
    w._ODSY.errors = {
        //Where we store the error entries. Emptied when the data is sent to the beacon.
        entries: [],

        //Stores all the errors we have found.
        log: [],

        //interval ID for the beaconHandler()
        intervalID: 0,

        //Stores the incrementing counter for how many times we're going to send the data out
        intervalCounter: 0,

        /**
         * Instantiates the error listeners as well as the handler for sending the data to the beacon.
         */
        init: function (){
            this.initErrorListener();
            this.initCSPListener();
            this.beaconHandler();
        },

        /**
         * Initiates the standard onerror event listener. We overwrite and resend the onerror so we don't
         * interfere with anyone else using the onerror event.
         */
        initErrorListener: function(){
            let nativeError = window.onerror;
            let self = this;
            
            window.onerror = function(msg, url, lineNo, columnNo, error) {
                //IMPORTANT: We call the original error function in case anyone else does the same thing as us in overwriting the onerror event.
                //If this is not done, it will cause problems with others on the stack.
                nativeError && nativeError(msg, url, lineNo, columnNo, error);
                self.captureError(arguments);
                return false;
            };
        },

        /**
         * Initiates the CSP event listener.
         */
        //TODO: Look into whether this works or not. It SHOULD but CSP's are a pain in the ass.
        initCSPListener: function(){
            let self = this;
            document.addEventListener('securitypolicyviolation', function(e) {
                // self.captureError(e.blockedURI, e.lineNumber, +new Date(), e.sourceFile, e.disposition);
                self.captureError(arguments);
            });
        },

        /**
         * Stores the arguments from the onerror event in an array to be sent later.
         * @param {object} args - Argument object from onerror 
         */
        captureError: function(args){
            _ODSY.debug === true && console.log(args);
            try{
                this.log.push(args);
                this.entries.push(args);
            }
            catch(e){
                console.log(e);
            }
        },

        captureXHRError: function(){

        },

        /**
         * Initiates the interval that sends off error data to the beacon as needed.
         * 
         * TODO: Here's an idea--what if we send off errors after waiting X milliseconds after the last error.
         * This might cause errors to not get sent if too many are continually occurring, but it might make it more flexible.
         */
        beaconHandler: function(){
            let _core = _ODSY.core;
            this.intervalID = setInterval(function(self){
                if(self.intervalCounter >= 3){
                    clearInterval(self.intervalID);
                }
                self.intervalCounter++;
                if(self.entries.length > 0){
                    _core.sendBeacon("error");
                    self.entries = [];
                }

            }, 10000, this, _core);
        }
    };

    //Single page application (SPA) handlers
    //TODO: Capture XHR/Fetch errors and send them to the error handlers
    w._ODSY.customTimer = {
        init: function () { 
            
        },
        start: function () {},
        update: function () {},
        end: function () {},
        
    };

    /**
     * Create wrappers for native functionality for tracking purposes.
     * Wrappers implemented for the following native functions
     * - XMLHttpRequest.prototype.open
     * - XMLHttpRequest.prototype.send
     * - fetch
     * - MutationObserver**
     * 
     * **Implemented, but does not overwrite native functionality
     */
    w._ODSY.nativeOverwrites = {
        //Stores the native prototype for XMLHttpRequest.prototype.open 
        nativeXHROpen: false,
        //Stores the native prototype for XMLHttpRequest.prototype.send
        nativeXHRSend: false,
        //Stores the original onreadystatechange functions so that they can be resubmitted
        xhrStateChange: {},
        //Stores the native fetch function
        nativeFetch: false,
        init: function(){
            this.xhrWrapper();
            this.fetchWrapper();
            this.mutationObserver();
        },
        xhrWrapper: function () {
            const _o = _ODSY;
            const _n = _o.nativeOverwrites;
            _n.nativeXHROpen = XMLHttpRequest.prototype.open;
            _n.nativeXHRSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.open = function(method, url) {
                var xhrApply = _n.nativeXHROpen.apply(this, arguments);
                try {
                    //I think this was designed to capture the call stack for the XHR request, but I'm not sure.
                    //Regardless, it could retrieve the stack that was created to generate the XHR request.
                    // this.tempError = new Error(xhrApply);

                    //Save these in the XHR object for reference later. Anything that needs to be used later
                    //can be stored in `this` and be referenced when `send()` occurs.
                    this.xhrMethod = !method ? "" : method;
                    this.xhrUrl = !url ? "" : url;

                } catch (e) {
                    console.log(e);
                }
            };

            XMLHttpRequest.prototype.send = function() {
                _n.nativeXHRSend.apply(this, arguments);
                try {
                    let method = this.xhrMethod;
                    let url = this.xhrUrl;
                    //TODO: If criteria is met, start a timer for SPA page naming with `_ODSY.customTimer.start()`

                    //Track the POST data in case we need it later
                    if (method === "POST") {
                        this.xhrPostData = arguments[0];
                    }

                    //Creates a random index that we can track and stores the current onreadystatechange so that we can overwrite/apply it.
                    const stateIndex = (Math.floor(Math.random() * (99999 - 10000)) + 10000);
                    _n.xhrStateChange[stateIndex] = this.onreadystatechange;
                    this.onreadystatechange = function() {
                        //Only reapply onreadystatechange if it was actually called by the site, otherwise it's null.
                        if (_n.xhrStateChange[stateIndex] != null) {
                            _n.xhrStateChange[stateIndex].apply(this, arguments);
                        }

                        //Only track if the XHR request has completed successfully. 
                        if (this.readyState == 4 && this.status >= 200 && this.status < 300) {
                            // var pageName, txnName, method = this.xhrMethod, vtEndArgs = {};
                            // var url = this.responseURL;
                            
                            //TODO: If criteria is met, end SPA timer here with `_ODSY.customTimer.end()`

                        } 
                        //If the request completes, but it's 400 or higher then it's an error so we report it.
                        else if (this.readyState == 4 && this.status >= 400) {
                            try {
                                // let msg = this.xhrMethod + " " + this.responseURL + " " + this.status + " (" + this.statusText + ")";
                                _o.errors.captureXHRError(this.xhrMethod, this.responseURL, this.status, this.statusText, "xhr");
                            } catch (e) {}
                        }
                    }
                } catch (e) {
                    console.log(e);
                }
            };
        },
        fetchWrapper: function () {
            if (typeof (fetch) !== "undefined") {
                let _n = _ODSY.nativeOverwrites;
                _n.nativeFetch = fetch;
                fetch = function(resource, options) {
                    let promise = _n.nativeFetch.apply(this, arguments);
                    let url = "";
                    try {
                        if (typeof (resource) === "object") {
                            url = resource.url != undefined ? resource.url : '';
                        } 
                        else if (typeof (resource) == "string") {
                            url = resource;
                        }
                    } catch (e) {
                        url = '';
                    }
                    try {
                        //TODO: If criteria is met, start a timer for SPA page naming with `_ODSY.customTimer.start()`
                    } catch (e) {
                        console.log(e);
                    }
                    return promise.then(function(response) {
                        if (response.status >= 200 && response.status < 300) {
                           //TODO: If criteria is met, end SPA timer here with `_ODSY.customTimer.end()`
                        } 
                        else if (response.status >= 400) {
                            try {
                                let method = options.hasOwnProperty('method') ? options["method"] + " " : "";
                                _o.errors.captureXHRError(method, response.url, response.status, response.statusText, "fetch");
                            } catch (e) {}
                        }
                        return response;
                    }, function(reason) {
                        throw reason;
                    });
                }
            }
        },
        //This might not belong here since it's not technically overwriting anything
        //TODO: Implement MutationObserver functionality for tracking SPA
        mutationObserver: function () {

        }

    }

    //Special handling for integrations
    w._ODSY.integrations = {}

    //NOTE: This might not be necessary if I send the entire PerformanceNavigationTiming since it contains the server timings and worker timings
    //Retrieves and populates the server timings
    //TODO: Implement server timings at the end since
    w._ODSY.serverTimings = {
        init: function () {
            //Probably going to need to intermingle server timings
            //with resource and nav timings
            console.log("Capturing server timings");
        }
    };

    _ODSY.core.init();

})(window, document);