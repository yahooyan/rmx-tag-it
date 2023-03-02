/**
 * Copyright (c)2012, Yahoo! Inc.  All rights reserved.
 *
 * See README file for full license terms.
 *
 * FILE:        log_window.js
 * Date:        2012/2/01
 * Description: Js file for the LogWindow class. It handles all functions
 *              for the logging window:
 *               - Clear log
 *               - Export log to txt/csv file
 *
 **/

var Cc = Components.classes;
var Ci = Components.interfaces;

function CCIN(cName, ifaceName) {
    return Cc[cName].createInstance(Ci[ifaceName]);
}

var LogWindow = {

     // @public, does what it says - opens the URL in a new tab in FF
     open_url : function( url ) {

        var parentWindow = window.opener;

		if( parentWindow && url.length > 0 ) {
			parentWindow.getBrowser().selectedTab = parentWindow.getBrowser().addTab( url );
		}
    },

    // @public
    // Copy the text content from the logging window given the reference node to the element
    // where the right-click popup event occurred.
    copy_content : function( node ) {

        var copytext = node.firstChild.textContent;

        try {

            var str = CCIN( "@mozilla.org/supports-string;1", "nsISupportsString" );

            if( !str ) {
                throw "Unable to instantiate the @mozilla.org/supports-string;1 object. Copy failed.";
            } else {
                str.data = copytext;
            }

            var trans = CCIN( "@mozilla.org/widget/transferable;1", "nsITransferable" );

            if( !trans ) {
                throw "Unable to instantiate the @mozilla.org/widget/transferable;1 object. Copy failed.";
            } else {
                trans.addDataFlavor( "text/unicode" );
                trans.setTransferData( "text/unicode", str, copytext.length * 2 );
            }

            var clip = CCIN( "@mozilla.org/widget/clipboard;1", "nsIClipboard" );

            if( !clip ) {
                throw "Unable to instantiate the @mozilla.org/widget/clipboard;1 object. Copy failed.";
            } else {
                clip.emptyClipboard( clip.kGlobalClipboard );
                clip.setData( trans, null, clip.kGlobalClipboard );
            }

        } catch ( err ) {
            alert( err );
        }
    },

    // @public - Self-explanatory, clears the log window. This is used
    // by the Clear Activity Log link in log_window.xul
    clear_log : function() {

        var tbody = document.getElementById( "rm-tag-finder-log-window-html-tbody" );

        if( tbody.rows.length == 0 ) {
            return 0;
        } else {
            while( tbody.hasChildNodes() ) {
               tbody.removeChild( tbody.firstChild );
            }
        }
    },

    // @private -
    // This fetches all the content rows available within the HTML tbody tags and
    // export them to a plain txt file using the Mozilla file-picker
    // and file-output-stream components
    get_all_data : function( cell_delimiter, row_delimiter, enclosed_by ) {

        // Initiate the headers
        var file_data = enclosed_by + "Time" + enclosed_by + cell_delimiter +
                        enclosed_by + "Domain" + enclosed_by + cell_delimiter +
                        enclosed_by + "URI" + enclosed_by + cell_delimiter +
                        enclosed_by + "Decoded Info" + enclosed_by + cell_delimiter + row_delimiter;

        var data_time;
        var data_domain;
        var data_request_made;
        var data_decoded_info;

        var tbody = document.getElementById("rm-tag-finder-log-window-html-tbody");

        for (var i = 0, row; row = tbody.rows[i]; i++) {
            //iterate through rows
            //rows would be accessed using the "row" variable assigned in the for loop
            data_request_uri  = row.cells[0];
            data_time         = row.cells[1];
            data_domain       = row.cells[2];
            data_decoded_info = row.cells[3];

            file_data += enclosed_by + data_time.firstChild.nodeValue + enclosed_by + cell_delimiter;
            file_data += enclosed_by + data_domain.firstChild.nodeValue + enclosed_by + cell_delimiter;
            file_data += enclosed_by + data_request_uri.firstChild.childNodes[1].textContent + enclosed_by + cell_delimiter;
            file_data += enclosed_by + data_decoded_info.firstChild.value + enclosed_by + cell_delimiter;

            file_data += row_delimiter;
        }

        return file_data;
    },

    // @private
    // exports the log contents in txt format
    // @returns a string of txt
    export_as_txt : function() {

        var cell_delimiter = "\r\n\r\n";
        var row_delimiter  = "-----" + cell_delimiter;

        try {
            my_data = this.get_all_data( cell_delimiter, row_delimiter, '' );
            return my_data;
        } catch( err ) {
            throw err;
        }
    },

    // @private
    // export the log contents in csv format
    // @return string
    export_as_csv : function() {

        var cell_delimiter = ",";
        var row_delimiter  = "\r\n";

        try {
            my_data = this.get_all_data( cell_delimiter, row_delimiter, '"' );
            return my_data;
        } catch( err ) {
            throw err;
        }
    },

    // @public function to export the log to a txt or csv file
    export_log: function() {

        const MODE = 0x2A; // MODE_WRONLY | MODE_CREATE | MODE_TRUNCAT
        const PERM = 0644; // PERM_IRUSR | PERM_IWUSR | PERM_IRGRP | PERM_IROTH

        try {

            var tbody = document.getElementById("rm-tag-finder-log-window-html-tbody");

            if( tbody.rows.length == 0 ) {
                throw "The log is empty.  There is nothing to export.";
            }

            var picker = CCIN( "@mozilla.org/filepicker;1", "nsIFilePicker" );
            picker.defaultExtension = "txt";
            picker.appendFilter( "Text Documents (*.txt)","*.txt" );
            picker.appendFilter( "CSV Documents (*.csv)","*.csv" ) ;
            picker.init ( window, 'Export Log', Ci.nsIFilePicker.modeSave );
            var rv = picker.show();

            if (rv != Ci.nsIFilePicker.returnCancel) {

                var os = CCIN( "@mozilla.org/network/file-output-stream;1", "nsIFileOutputStream" );
                os.init( picker.file, MODE, PERM, 0 );

                // plain txt file format
                // use picker.file.path instead of file.target - in Mac/Linux they will break
                if( picker.file.path.indexOf('.txt') != -1 ) {
                    log_window_data = this.export_as_txt();
                } else { // comma separated values
                    log_window_data = this.export_as_csv();
                }

                os.write( log_window_data, log_window_data.length );
                os.close();
            }

        } catch( err ) {
            alert('There was a problem while exporting the data: ' + err );
        }
    }
};