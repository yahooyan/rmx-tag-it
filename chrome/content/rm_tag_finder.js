/**
 * Copyright (c)2012, Yahoo! Inc.  All rights reserved.
 *
 * See README file for full license terms.
 *
 *  FILE:        rm_tag_finder.js
 *  Date:        2011/11/23
 *  Description: Js file for the Response/TracingListener and RmTagFinder class.
 *                This is the core file that will enable the tool to
 *                listen to HTTP requests of Yieldmanager ad tags,
 *                using the various Mozilla services.  It will then attempt to decode
 *                the ad tag information and log them to a separate window for
 *                debugging purposes.
 */

var Cc = Components.classes;
var Ci = Components.interfaces;

function CCIN(cName, ifaceName) {
    return Cc[cName].createInstance(Ci[ifaceName]);
}

//
// Reads the incoming stream from a http response,
// join the data received and pass the whole response back
// to the RmTagFinder object for further processing.
function TracingListener() {};

TracingListener.prototype = {

    originalListener : null,
    receivedData : null,

    onStartRequest: function( request, context ) {
        this.receivedData = [];
        this.originalListener.onStartRequest( request, context );
    },

    onDataAvailable: function( request, context, inputStream, offset, count ) {
        var binaryInputStream   = CCIN("@mozilla.org/binaryinputstream;1",
                                       "nsIBinaryInputStream");
        var storageStream       = CCIN("@mozilla.org/storagestream;1", "nsIStorageStream");
        var binaryOutputStream  = CCIN("@mozilla.org/binaryoutputstream;1",
                                       "nsIBinaryOutputStream");

        binaryInputStream.setInputStream(inputStream);
        storageStream.init(8192, count, null);
        binaryOutputStream.setOutputStream(storageStream.getOutputStream(0));

        // Copy received data as they come.
        var data = binaryInputStream.readBytes(count);

        this.receivedData.push(data);

        binaryOutputStream.writeBytes(data, count);

        this.originalListener.onDataAvailable(request, context,
            storageStream.newInputStream(0), offset, count);
    },

    onStopRequest: function(request, context, statusCode) {
        // Get entire response and pass it back to RmTagFinder for further processing
        var responseSource = this.receivedData.join();
        RmTagFinder.append_extra_data( request.originalURI.spec, responseSource);

        this.originalListener.onStopRequest(request, context, statusCode);
    },

    QueryInterface: function (aIID) {
        if (aIID.equals(Ci.nsIStreamListener) ||
            aIID.equals(Ci.nsISupports)) {
            return this;
        }
        throw Components.results.NS_NOINTERFACE;
    }
};

// Object to wrap our functions
var RmTagFinder = {

    log_window_row: "odd",

    // Constants
    // Make sure we attach HTML elements to the xhtml namespace and XUL elements to the XUL
    // namespace, otherwise, we'll get errors
    get htmlns() { return "http://www.w3.org/1999/xhtml" },
    get xulns() { return "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul" },
    get creative_preview_url() { return "http://ad.yieldmanager.com/cr?" },

    // This is called when the window has finished loading
    initialize : function(event) {

        var observerService = Cc["@mozilla.org/observer-service;1"]
                            .getService(Ci.nsIObserverService);

        observerService.addObserver(this, "http-on-modify-request", false);
        observerService.addObserver(this, "http-on-examine-response", false);
    },

    // Called when this Mozilla window is closed
    uninitialize : function(event) {

        var observerService = Cc["@mozilla.org/observer-service;1"]
                                 .getService(Ci.nsIObserverService);

        observerService.removeObserver( this, "http-on-modify-request" );
        observerService.removeObserver( this, "http-on-examine-response" );
    },

    // opens the log window - it checks to see if the logging windows is already opened, if so,
    // the function will focus on it
    open_log_window : function() {

        var win_obj = this.get_log_window();

        if( !win_obj.is_opened ) {
            var win = window.open( "chrome://rmtagfinder/content/log_window/log_window.xul",
                               "rm-tag-finder-log-window",
                               "centerscreen,menubar=yes,chrome=yes,resizable=yes,scrollbars=yes,status=yes,width=900,height=800"
                             );

            win.focus();
        } else {
            win_obj.log_win.focus();
        }
    },

    about : function() {
        window.openDialog( "chrome://rmtagfinder/content/about/about.xul",
                           "rm-tag-finder-about-dialog",
                           "centerscreen,chrome,modal"
                         );
    },

    // Turns the logging on and off.
    toggle: function(XULElement, event) {

        if( XULElement.getAttribute('checked') ) {

            this.initialize(event);
             //this.log_to_console("RM Tag Finder is enabled by user.");

        } else {

            this.uninitialize(event);
            //this.log_to_console("RM Tag Finder is disabled by user.");
        }

        //rm-tag-finder-menu-enable
    },

    // This adds the ability to pull the click tag URL parameter for a Flash file
    // we'll make attempts to extract and return it as an unescaped string
    extract_clickurl_from_clicktag : function( sUrl ) {

        click_tag_param = this.extract_url_param( sUrl, 'clicktag' );

        if( click_tag_param.length >  0 ) {
            click_tag_param = unescape( click_tag_param );
            if( click_tag_param.match( /\/clk\?3/ )) {
                return click_tag_param;
            }
        }

        return '';

        /* Example:
        http://content.yieldmanager.edgesuite.net/atoms/60/ea/d9/df/60ead9dffad9fa07ba475883d7d586ac.swf?clickTAG=http%3A%2F%2Fads%2Ebluelithium
        %2Ecom%2Fclk%3F3%2CeAGlkNuOgjAURb%2DGN0J6oVBC5qEGjUbR0dHJwIuB0lFURKEG4ett0fEHpmlyzl77XJpC7DsU2MKzAU09W1CAfIgJEQByjrEJfN%2DHyAGUQgiJuWqWj
        A3PyXjJ3Go6ZP0ZHbtp80wZC7x4OXmKT8qsJrCsu1z ... Vlpg0EkPpqB7rK4qmuxIi6kBCKPVfnire3TBltxQ1EcHarVVCQ73qpHqRVW6a9hB5VazVJZQ8e206KSg%3D%3D%2C
        */
    },

    // Attempts to find the ad size parameters from a specific url
    // Returns: ad_size in the format 300x250.
    // If nothing is found, this returns an empty string
    extract_ad_size_from_uri : function( sUrl ) {

         ad_size = this.extract_url_param( sUrl, 'ad_size' );

         if( ad_size.length == 0 ) {
             ad_size = this.extract_url_param( sUrl, 'Z' )
         }

         // 300x400
         if( ad_size.match( /^\d+x\d+$/ )) {
             return ad_size;
         } else {
            return "";
         }
    },

    // Returns the ad size dimensions separately from the decoded info given
    // The purpose of this is to determine the ad size so that we can draw
    // the ad preview iframe dynamically in the logging window
    extract_ad_size_from_details : function( decoded_info ) {

        var match = decoded_info.match( /Size: (\d+)x(\d+)/ )
        if( match && match[1].length > 0 && match[2].length > 0 ) {
            dim1 = parseInt(match[1]);
            dim2 = parseInt(match[2]);
            return {
                ad_width: dim1,
                ad_height: dim2
            };
        } else {
            return false;
        }
    },

    // Extracts a Url param from a given URL, ignoring the parameter name casing
    // Returns: string if anything is found.
    //          empty string if nothing is found
    extract_url_param : function( sUrl, sParamName ) {

		var regexS;
		var regexl;
		var results;

		name = sParamName.replace(/[\[]/,"\\\[").replace(/[\]]/,"\\\]");
		regexS = "[\\?&]"+name+"=([^&#]*)";
		regex = new RegExp(regexS, "i"); // Ignore case
		results = regex.exec (sUrl);

		if ( results == null ) {
			return "";
		} else {
			return results[1];
		}
    },

    // Pulls the creative ID from the decoded info
    extract_creative_id : function( sDecodedInfo ) {

        var creative_id_matches = sDecodedInfo.match(/creative id\s*\:\s*(\d+)/i );

        if( creative_id_matches && creative_id_matches[1].length > 0 ) {
            return creative_id_matches[1];
        } else {
            return 0;
        }
    },

    /* Takes in an iframe3 or clk URL and returns the decoded data
        precondition: the url is assumed to be decodible and that it is a valid Yieldmanager ad tag
        postcondition: decoded info in plain text will be returned by the ajax get request to yieldmanager.
                       if nothing is decodable, this will return an empty string or no data.
    */
    decode_url : function( url_to_decode, url_type ) {

        var decodeUrl;

       // url_to_decode.replace(/bluelithium/, 'yieldmanager');

        if( url_type == 'clk' ) {
            decodeUrl = url_to_decode.replace(/\/clk\?/g, '\/decode\-clk\?');
        } else if( url_type == 'iframe3' ) {
            decodeUrl = url_to_decode.replace(/\/iframe3\?/g, '\/decode\-iframe3\?');
        } else {
            return "";
        }

        return this.get_ajax_response( decodeUrl );
    },

    // Append extra data to the logging window.
	// expected data: These are supposed to be IMP responses extracted by the TracingListener
	// uri: the uri of the imp request (needed to find the corresponding txtarea by id)
   append_extra_data : function( uri, data ) {

        var win_obj = this.get_log_window();

        if( win_obj.is_opened ) {

            var decoded_txtarea = win_obj.log_win.document.getElementById('original|' + uri);

            if( decoded_txtarea == null ) {
               // alert( 'not found: ' + 'original|' + uri);
                return false;
            }

            var decoded_info    = '';

            /* Regex out the relevant info from the Impression response.
            Creative ID, offer type and entity ID

            The lines we're looking for is basically

            rm_data.creative_id = 11882152;
                rm_data.offer_type = 11;
                rm_data.entity_id = 596059;

            In addition, the response might dynamically write an anchor tag
            to the HTML page. This is most likely a click tag, thus we'll make an attempt to
            pull it out also:

                document.write('<a target=\"_blank\" href=\"http://ads.bluelithium.com/clk?3,eAGdTV1vgjAU.TW-UVJaQQjZQ7FKTKhZNp
                ... egB50QwNEU0je5HrZ1.IXKRRuig==,\"><img border=\"0\" alt=\"\" height=\"250\" width=\"300\" src=\"http://conte
                nt.yieldmanager.edgesuite.net/atoms/1d/9a/97/5a/1d9a975aaf9afb61a5e6d94af46d83f3.gif\"></img></a>');
           */
            var matches     = data.match(/(creative_id|offer_type|entity_id)\s*\=\s*\d+/g);
            var txtrows     = [];
            var creative_id = 0;
            var item_regexp;

            for( i in matches ) {

                matched_value = matches[i].replace(/\s/g, '').replace(/_/, ' ').replace(/=/, ': ')

                if( matched_value.match( /creative/ ) ) {
                    creative_id = this.extract_creative_id( matched_value );
                }

                // Make sure we don't insert duplicate data
                item_regexp = new RegExp( matched_value, 'ig' ) ;
                if( !decoded_txtarea.value.match( item_regexp )) {
                    txtrows.push( matched_value );
                }
            }

            // Extract the clk tag in an IMP response (if present) and decode it.
            var extract_clk_tag = data.replace( /(\r\n|\n|\r)/gm,"" );
            match_clk_url       = extract_clk_tag.match( /(http.*clk\?3,.+,)\\\"/ );

            if( match_clk_url && match_clk_url[1].length > 0 ) {
                decoded_info =  this.decode_url( match_clk_url[1], 'clk' );
                txtrows.push( decoded_info );
            }

            // Append to the field if there's already decoded data being displayed in it.
            if( decoded_txtarea.value != 'Nothing to decode' ) {
                new_decoded_txt = decoded_txtarea.value + "\n" + txtrows.join("\n");
            } else {
                new_decoded_txt = txtrows.join("\n");
            }

             decoded_txtarea.setAttribute("rows", this.get_linebreak_count( new_decoded_txt ) );
             decoded_txtarea.setAttribute("value", new_decoded_txt );

             // Extract the ad size dimensions from the decoded_txtarea (if any) and set them dynamically in the iframe
             // generator function below
             ad_sizes = this.extract_ad_size_from_details( new_decoded_txt );

            // Add the creative to the logging window if we managed to get the
            // creative ID from the response
            if( creative_id ) {

                var iframe_ad = win_obj.log_win.document.getElementById( 'original_ad|' + uri );
                if( iframe_ad ) {
                    this.generate_iframe_preview_ad( iframe_ad, creative_id, ad_sizes );
                }

                // Add the anchor link to the ad preview if it hasn't been added already (For cases where originally,
                // there's Nothing to Decode, the link isn't created).
                var original_preview = win_obj.log_win.document.getElementById('original_preview|' + uri );
                if( original_preview == null ) {
                    var original_info_cell = win_obj.log_win.document.getElementById('original_info|' + uri);
                    original_info_cell.appendChild( this.generate_preview_ad_anchor( uri, creative_id ) );
                }
            }
        }
    },

    /*
    uri: uri where we found the creative_id
    creative_id: int
    ad_sizes: object literal with two keys: ad_height and ad_width (integers)
    */
    generate_iframe_preview_ad : function( iframe_ad, creative_id, ad_sizes ) {

        iframe_ad.setAttribute( "src", this.creative_preview_url + creative_id );
        iframe_ad.setAttribute("type", "content");

        if( ad_sizes ) {
            // disable scrollbar and enforce dimensions
            iframe_ad.setAttribute("style", "overflow:hidden; height: " + ad_sizes.ad_height + "px; width: " + ad_sizes.ad_width + "px; overflow:hidden" );
        } else {
            // if we are not able to fetch the ad size, then draw an iframe with 100% height and scrollbars
            iframe_ad.setAttribute("style", "overflow:auto; height: 100%;");
        }
    },

    /* add a preview ad button to the row,
    this function doesn't assume that the button is already added
    so you should check to see whether you should add one.
     */
    generate_preview_ad_anchor : function( uri, creative_id ) {

        var preview_href = document.createElementNS( this.htmlns, "a");
        preview_href.setAttribute("class", "icon_wrapper");
        preview_href.setAttribute("id", "original_preview|" + uri );
        preview_href.setAttribute("onclick", "LogWindow.open_url('" + this.creative_preview_url + creative_id + "')" );

        var preview_link_button = document.createElementNS( this.htmlns, "span" );
        preview_link_button.setAttribute('class', 'preview_link_button');

        preview_href.appendChild( preview_link_button );
        return preview_href;
    },

    // This function implements the nsIObserver interface
    observe : function( aSubject, aTopic, aData ) {

        // Only listen if the user enabled the tool
        if( document.getElementById("rm-tag-finder-menu-enable").getAttribute("checked") == "true" ) {

            var decodeUrl;

            var logData = {};

            if (aTopic == "http-on-modify-request" ) {

                // Hook up an interface to the http Channel that we are listening to so we can pull its parameters
                // and log the information we need
                var httpChannel = aSubject.QueryInterface( Ci.nsIHttpChannel );
                var currentURI  = httpChannel.URI.spec;

                // Listen to all the ad.yieldmanager.com and content.yieldmanager* GET requests
                // while excluding the decode calls we make ourselves.
                if( httpChannel.URI.host.match( /(ad|ads|content)\.(yieldmanager|bluelithium)\.(com|edgesuite)/ )
                    &&
                      !currentURI.match( /(decode\-iframe3|decode\-clk|\.com\/cr\?|previewclick|flash_activate)/ ) ) {

                    //alert(currentURI);
                    // additional fields - httpChannel.responseStatus, httpChannel.originalURI.spec, httpChannel.getResponseHeader('location')
                    logData.time         = this.get_time();
                    logData.domain       = httpChannel.URI.host;
                    logData.request      = httpChannel.URI.spec;
                    logData.request_path = httpChannel.URI.path;
                    logData.referer      = httpChannel.getRequestHeader("referer");
                    logData.decoded_info = '';

                    // Decode the information once we find an iframe.
                    if( currentURI.match( /\/iframe3/ )) {
                        logData.decoded_info = this.decode_url( currentURI, 'iframe3' );
                    }

                    // Extract the ad_size from the initial st/imp calls (if any) and attach it to the decoded_info field.
                    if( currentURI.match( /\/st|imp\?/ )) {
                        ad_size = this.extract_ad_size_from_uri( currentURI );

                        if( ad_size.length > 0 ) {
                            logData.decoded_info += 'Size: ' + ad_size;
                        }
                    }

                    this.log_to_window( logData );
                }
            } // end if http-on-modify-request

            // Listen for certain http responses (imp, flash files)
            // so we could parse out certain info from them.
            if( aTopic == 'http-on-examine-response' ) {

                  //  alert( aSubject.originalURI.path);
                var log_win = this.get_log_window();

                if( log_win.is_opened
                   &&
                   aSubject.originalURI ) {

                        // Listen to any of the impression responses and append additional
                        // info to the logging window.
                        // Sample imp call to look out for:
                        //      http://ad.yieldmanager.com/imp?_PVID=w7VUk0S00iaNMIvcTwSJUA5R0YM..... (truncated just to show example)
                       if( aSubject.originalURI.path.match( /\/imp\?/ )
                          &&
                            aSubject.originalURI.host.match( /(ad|ads|content)\.(yieldmanager|bluelithium)\.(com|edgesuite)/ ) )  {

                            aSubject.QueryInterface( Ci.nsIHttpChannel );

                            // This is a custom data stream listener to capture the response we're looking for
                            // In this case, the response of an ad impression call.
                            // Afterwards, the listener will call append_extra_data and it will extract and
                            // append additional decodable info to the logging window
                            var newListener = new TracingListener();

                            aSubject.QueryInterface( Ci.nsITraceableChannel );
                            newListener.originalListener = aSubject.setNewListener( newListener );
                       }

                        // Within a response for a Flash file, attempt to locate and extract
                        // the clickTAG parameter.  This contains the clk URL that can be decoded.
                        //  This case usually happens after an IMP call.
                        // http-on-modify-request will not always pick these requests up, so we place it here.
                        if( aSubject.originalURI.path.match( /clicktag/i )
                           &&
                             aSubject.originalURI.host.match( /(ad|ads|content)\.(yieldmanager|bluelithium)\.(com|edgesuite)/ ) ) {

                            /* Attempt to extract the clk url like below from the clickTAG= param
                            http://ads.yieldmanager.com/clk?3,eAGljtuOgjAURb-GN0J6oVBD5qEG ..... wROVaRWIxgF-PZ4th,
                            */
                            var click_url = this.extract_clickurl_from_clicktag( aSubject.originalURI.spec );

                            if( click_url.length > 0 ) {

                                var httpChannel = aSubject.QueryInterface( Ci.nsIHttpChannel );
                                // additional fields - httpChannel.responseStatus, httpChannel.originalURI.spec, httpChannel.getResponseHeader('location')
                                logData.time         = this.get_time();
                                logData.domain       = httpChannel.URI.host;
                                logData.request      = httpChannel.URI.spec;
                                logData.request_path = httpChannel.URI.path;
                                logData.referer      = httpChannel.getRequestHeader("referer");
                                logData.decoded_info = this.decode_url( click_url, 'clk' );

                                this.log_to_window( logData );

                            } // end if click_url.length > 0
                       } // end if
                 }
            } // end if http-on-examine-response
        } // if Extension is enabled
    }, // end observer function

    // This just gives the current time in hh:mm:ss:ms, Javascript doesn't have a date("hh:mm:ss") function
    get_time : function() {

        var dd = new Date();
        var hh = dd.getHours();
        var mm = dd.getMinutes();
        var ss = dd.getSeconds();
        var ms = dd.getMilliseconds();

        if( hh < 10 ) {
            hh = "0" + hh;
        }

        if( mm < 10 ) {
            mm = "0" + mm;
        }

        if( ss < 10 ) {
            ss = "0" + ss;
        }

        if( ms < 100 ) {
            if( ms < 10 ) {
                ms = "00" + ms;
            } else {
                ms = "0" + ms;
            }
        }

        var timestr =  hh + ":" + mm + ":" + ss + '.' + ms ;
        return timestr;
    },

    // Logs to the Firefox Error Console any essential debugging info for the tool
    log_to_console : function( msg ) {

        var consoleService = Cc["@mozilla.org/consoleservice;1"].getService( Ci.nsIConsoleService );
        consoleService.logStringMessage(msg);
    },

    // Find our logging window and return it along with a boolean true/false value of whether it's found or not.
    get_log_window : function() {

       // Fetch the window-watcher service so we can find the activity log window
       var wenum = Cc["@mozilla.org/embedcomp/window-watcher;1"]
                               .getService(Ci.nsIWindowWatcher)
                               .getWindowEnumerator();

       var windowName = "rm-tag-finder-log-window";
       var bIsOpened  = false;

        while( wenum.hasMoreElements() ) {

            var win = wenum.getNext();

            if (win.name == windowName) {
                bIsOpened = true;
                break;
            }
        }

        return { log_win : win,
                 is_opened : bIsOpened
        };
    },

    log_to_window : function( data ) {

        var win_obj = this.get_log_window();

        if( !win_obj.is_opened ) {
             //this.log_to_console("debug - [" + this.get_time() + "] Activity log is not opened, logging disabled");
             return 0;
        } else {

           try {
               this.append_data_row( win_obj.log_win, data );
           } catch(e) {
               this.log_to_console("tag.it debug - [" + this.get_time() + "] " + e.description + " - " + e.message );
            }
        } // end if
    },

	// append row to the HTML table
    append_data_row : function( win, data ) {

        var tbl    = win.document.getElementById('rm-tag-finder-log-window-html-table');

        var creative_id = 0;

        var row    = document.createElementNS( this.htmlns, "tr");
            row.id = data.request;

         // Code that will highlight the cells for the original referer and the current request
        // so we can see the chain of request and how they relate to each other
        row.onmouseover = function() {

             this.classList.add("highlight_current");

             // highlight the referer as well, for some reason, classList.add|toggle|remove doesn't work for the XUL textbox,
             // so we'll just overwrite the existing class with a new one using setAttribute
             if( win.document.getElementById( 'original|' + data.referer ) ) {
                win.document.getElementById( 'original|' + data.referer ).setAttribute("class", "debug_info_textbox_highlight");
             }
         }

        row.onmouseout = function() {

            this.classList.remove("highlight_current");

            if( win.document.getElementById( 'original|' + data.referer ) ) {
                win.document.getElementById( 'original|' + data.referer ).setAttribute("class", "debug_info_textbox");
            }
        }

        // Alternating row coloring for easier view
        if( this.log_window_row == 'odd' ) {
            row.className = 'row_odd';
            this.log_window_row = 'even';
        } else {
            row.className = 'row_even';
            this.log_window_row = 'odd';
        }

        // Attempt to locate the Ad Size based on the previous request.
        var orig_decoded_info = win.document.getElementById( 'original|' + data.referer );

        if( orig_decoded_info ) {
             ad_sizes = this.extract_ad_size_from_details( orig_decoded_info.value );
         } else {
             ad_sizes = null;
         }

         var decoded_txt = '';

        if( data.decoded_info != null && data.decoded_info.length > 0 ) {
            if( !this.extract_ad_size_from_details( data.decoded_info ) ) {
                if( ad_sizes ) {
                    decoded_txt = 'Size: ' + ad_sizes.ad_width + 'x' + ad_sizes.ad_height + "\n";
                }
            }
            decoded_txt += data.decoded_info;
            creative_id = this.extract_creative_id( data.decoded_info );
        } else {
            decoded_txt = 'Nothing to decode';
        }

        // -- Info - area that contains the URI of the request
        var cell = document.createElementNS( this.htmlns, "td" );
        cell.setAttribute("id", 'original_info|' + data.request );

        var info_icon_wrapper = document.createElementNS( this.htmlns, "a" );
        info_icon_wrapper.setAttribute('class', 'icon_wrapper');

        var info_button = document.createElementNS( this.htmlns, "span" );
        info_button.setAttribute('class', 'info_button');

        // on hover, show the full GET request in a larger field
        var data_request = document.createElementNS( this.xulns, "description" );
        data_request.setAttribute('class', 'data_req' );
        data_request.setAttribute('context', 'rm-tag-finder-logwindow-popup' );
        data_request.appendChild( document.createTextNode( data.request ) );

        info_icon_wrapper.appendChild( info_button );
        info_icon_wrapper.appendChild( data_request );

        cell.appendChild( info_icon_wrapper );

        // Optional preview ad button - This might seem redundant at first, but the
        // reason I add it is because sometimes the ad might not render properly due to
        // popup/script blocker.  This will give the user an option
        // to open the ad in a new browser tab.
        if( creative_id ) {
            cell.appendChild( this.generate_preview_ad_anchor( data.request, creative_id ) );
        }

        row.appendChild( cell );

        // -- Time
        cell    = document.createElementNS( this.htmlns, "td" );
        txt     = document.createTextNode( data.time );
        cell.setAttribute("width", "60");
        cell.appendChild( txt );
        row.appendChild( cell );

        // -- Domain
        cell    = document.createElementNS( this.htmlns, "td" );
        txt     = document.createTextNode( data.domain );
        cell.setAttribute("width", "100");
        cell.appendChild( txt );
        row.appendChild( cell );

        // -- Decoded Info - if any
        cell = document.createElementNS( this.htmlns, "td" );

        var txtarea = document.createElementNS( this.xulns, "textbox");

        txtarea.setAttribute("class", "debug_info_textbox");
        txtarea.setAttribute("readonly", "readonly");
        txtarea.setAttribute("context", 'rm-tag-finder-logwindow-popup');
        txtarea.setAttribute("multiline", "true");
        txtarea.setAttribute("rows", this.get_linebreak_count( decoded_txt ) );
        txtarea.setAttribute("value", decoded_txt /*+ "\n" + data.referer*/ );
        txtarea.setAttribute("id", 'original|' + data.request );

        cell.appendChild( txtarea );

        row.appendChild( cell );

        // -- Lastly if we are able to grab the creative ID
        // then display the preview ad as well
        cell = document.createElementNS( this.htmlns, "td" );

        var iframe_ad = document.createElementNS( this.htmlns, "iframe" );
        iframe_ad.id  = "original_ad|" + data.request;

        if( creative_id ) {
            this.generate_iframe_preview_ad( iframe_ad, creative_id, ad_sizes );
        }

        cell.appendChild( iframe_ad );
        row.appendChild( cell );
        tbl.getElementsByTagName("html:tbody")[0].appendChild( row );
    },

    get_linebreak_count : function( str ) {

        try {
            return((str.match( /[^\n]*\n[^\n]*/gi ).length ));
        } catch(e) {
            return 1;
        }
    },

    // Performs an ajax call and returns the response
    get_ajax_response : function( url ) {

        var xhReq = new XMLHttpRequest();
        xhReq.open("GET", url, false);
        xhReq.send(null);
        var serverResponse = xhReq.responseText;

        /* remove this piece of useless text
         Status: OK
        Created: Mon Feb 27 21:07:05 2012
        Created Seconds Ago: 0
        */
        serverResponse = serverResponse.replace( /Status:.+\nCreated:.+\nCreated Seconds Ago:\s*\d+\n/i, '');

        return serverResponse;
    }
};

// This is run when a new mozilla window loads
window.addEventListener( "load", function(event) { RmTagFinder.initialize(event); }, false );
window.addEventListener( "unload", function(event) { RmTagFinder.uninitialize(event); }, false );