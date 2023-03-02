/**
 * Copyright (c)2012, Yahoo! Inc.  All rights reserved.
 *
 * See README file for full license terms.
 *
 * FILE:        about.js
 * Date:        2011/11/23
 * Description: About js file for the RM Yieldmanage Tag Finder
 **/

var RmTagFinderAbout = {

    open_url : function( urlElement ) {

		var parentWindow = null;
		var url          = urlElement.firstChild.nodeValue;

		// If there is a parent window
		if(window.opener) {
			// If there is a grand parent window and it has the extension menu
			if(window.opener.opener && window.opener.opener.document.getElementById("rm-tag-finder-menu")) {
				parentWindow = window.opener.opener;
			}
			else {
				parentWindow = window.opener;
			}
		}

		// If a parent window was found
		if(parentWindow) {
			parentWindow.getBrowser().selectedTab = parentWindow.getBrowser().addTab(url);
			window.close();
		}
	}
};