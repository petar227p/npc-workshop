// Project-owned AS2 / Flash 8 conversation UI. Inventory and command admission stay in Papyrus/adapter.
class ConversationMenu {
    static var root:MovieClip;
    static var input:TextField;
    static var history:TextField;
    static var status:TextField;
    static var pending:TextField;
    static var gold:TextField;
    static var keys:Object;
    static var mouse:Object;
    static var captured:Boolean = false;
    static var busy:Boolean = true;
    static var awaitingAdmission:Boolean = false;
    static var pendingId:String = "";
    static var pendingText:String = "";
    static var pendingKind:String = "say";
    static var sendButton:MovieClip;
    static var offers:Array;
    static var incomingOffers:Array;
    static var offerRevision:String = "";
    static var offerPage:Number = 0;
    static var offerCards:Array;
    static var offerButtons:Array;
    static var offerCount:TextField;
    static var selected:Object = null;
    static var confirmation:MovieClip;
    static var confirmButton:MovieClip;
    static var cancelButton:MovieClip;
    static var playerGold:Number = 0;
    static var inventory:MovieClip;
    static var inventoryOpen:Boolean = false;
    static var inventoryLoading:Boolean = false;
    static var inventoryRequest:Number = 0;
    static var inventoryPage:Number = 0;
    static var inventoryPages:Number = 1;
    static var inventoryRows:Array;
    static var inventoryControls:Array;
    static var inventoryButton:MovieClip;

    static function panel(mc:MovieClip, x:Number, y:Number, w:Number, h:Number, alpha:Number):Void {
        mc.beginFill(0x08090b, alpha);
        mc.moveTo(x, y); mc.lineTo(x + w, y); mc.lineTo(x + w, y + h); mc.lineTo(x, y + h); mc.lineTo(x, y); mc.endFill();
    }

    static function divider(mc:MovieClip, x:Number, y:Number, w:Number):Void {
        mc.lineStyle(1, 0xb9bdbe, 65);
        mc.moveTo(x, y); mc.lineTo(x + w / 2 - 9, y);
        mc.moveTo(x + w / 2 + 9, y); mc.lineTo(x + w, y);
        mc.moveTo(x + w / 2, y - 4); mc.lineTo(x + w / 2 + 4, y);
        mc.lineTo(x + w / 2, y + 4); mc.lineTo(x + w / 2 - 4, y); mc.lineTo(x + w / 2, y - 4);
        mc.lineStyle();
    }

    static function childField(mc:MovieClip, fieldName:String, depth:Number, x:Number, y:Number, w:Number, h:Number, size:Number):TextField {
        mc.createTextField(fieldName, depth, x, y, w, h);
        var f:TextField = mc[fieldName];
        f.setNewTextFormat(new TextFormat("$EverywhereFont", size, 0xe8e8e8));
        f.multiline = true; f.wordWrap = true; f.html = false; f.selectable = false;
        return f;
    }

    static function field(fieldName:String, depth:Number, x:Number, y:Number, w:Number, h:Number, size:Number):TextField {
        return childField(root, fieldName, depth, x, y, w, h, size);
    }

    static function button(buttonName:String, depth:Number, x:Number, y:Number, w:Number, label:String, action:Function):MovieClip {
        var b:MovieClip = root.createEmptyMovieClip(buttonName, depth);
        b._x = x; b._y = y;
        panel(b, 0, 0, w, 40, 35);
        b.lineStyle(1, 0xb9bdbe, 55);
        b.moveTo(0, 39); b.lineTo(w, 39); b.lineStyle();
        var hover:MovieClip = b.createEmptyMovieClip("hover", 0);
        panel(hover, 0, 0, w, 40, 16); hover._visible = false;
        b.createTextField("label", 1, 10, 7, w - 14, 30);
        b.label.setNewTextFormat(new TextFormat("$EverywhereFont", 20, 0xe8e8e8));
        b.label.text = label; b.label.selectable = false; b.onRelease = action;
        b.onRollOver = function():Void { this.hover._visible = true; this.label.textColor = 0xffffff; };
        b.onRollOut = b.onReleaseOutside = function():Void { this.hover._visible = false; this.label.textColor = 0xe8e8e8; };
        return b;
    }

    static function setBusy(locked:Boolean):Void {
        busy = locked || awaitingAdmission;
        sendButton._alpha = busy || selected != null || inventoryOpen ? 40 : 100;
        input.type = busy || selected != null || inventoryOpen ? "dynamic" : "input";
        renderOffers();
    }

    static function send():Void {
        if (busy || selected != null || inventoryOpen || root.nwToken == "" || input.text.split(" ").join("").split("\t").join("").split("\r").join("").split("\n").join("") == "") return;
        root.nwText = input.text; root.nwSubmitted = input.text;
        pendingText = input.text;
        pendingKind = "say";
        pending.text = "You (sending): " + pendingText;
        awaitingAdmission = true;
        setBusy(true);
        status.text = "Sending...";
        _global.skse.SendModEvent("NWConversationSend", root.nwToken, root.nwGeneration);
    }

    static function terms(o:Object):String {
        // Total is exact integer gold. Mark rounded repeating unit prices explicitly.
        var unit:Number = o.total / o.quantity;
        var rounded:Number = Math.round(unit * 100) / 100;
        return o.quantity + " x " + o.item + "\nUnit: " + (unit == rounded ? "" : "~") + rounded + " gold\nTotal: " + o.total + " gold";
    }

    static function renderOffers():Void {
        var pages:Number = Math.max(1, Math.ceil(offers.length / 2));
        offerPage = Math.min(offerPage, pages - 1);
        offerCount.text = offers.length == 0 ? "No current offers" : "Offers — " + (offerPage + 1) + "/" + pages;
        var i:Number;
        for (i = 0; i < 2; i++) {
            var o:Object = offers[offerPage * 2 + i];
            offerCards[i].text = o == undefined ? "" : terms(o);
            offerButtons[i]._visible = o != undefined;
            offerButtons[i]._alpha = busy || selected != null || (o != undefined && o.total > playerGold) ? 40 : 100;
        }
    }

    static function pageOffers(delta:Number):Void {
        if (selected != null || inventoryOpen) return;
        offerPage = Math.max(0, Math.min(offerPage + delta, Math.ceil(offers.length / 2) - 1));
        renderOffers();
    }

    static function review(index:Number):Void {
        var o:Object = offers[offerPage * 2 + index];
        if (busy || selected != null || inventoryOpen || o == undefined || o.total > playerGold || root.nwToken == "") return;
        // Freeze this contract/revision and all displayed terms. Updates never retarget confirmation.
        selected = { contract:o.contract, revision:o.revision, item:o.item, quantity:o.quantity, unit:o.unit, total:o.total };
        confirmation.details.text = terms(selected) + "\n\nPlayer gold: " + playerGold + "\nOffer: " + selected.contract + " / revision " + selected.revision;
        confirmation._visible = true; confirmButton._visible = true; cancelButton._visible = true;
        Selection.setFocus(null);
        setBusy(false);
    }

    static function dismissConfirmation():Void {
        selected = null;
        confirmation._visible = false; confirmButton._visible = false; cancelButton._visible = false;
        setBusy(busy);
        if (!busy) Selection.setFocus(input);
    }

    static function confirm():Void {
        if (busy || selected == null || selected.total > playerGold) return;
        root.nwAcceptContract = selected.contract;
        root.nwAcceptRevision = selected.revision;
        pendingKind = "accept"; pendingText = "";
        awaitingAdmission = true;
        dismissConfirmation();
        pending.text = "Accepting selected offer...";
        status.text = "Sending acceptance...";
        setBusy(true);
        _global.skse.SendModEvent("NWConversationAccept", root.nwToken, root.nwGeneration);
    }

    static function shutdown():Void {
        if (captured) { _global.skse.AllowTextInput(false); captured = false; }
        Key.removeListener(keys); Mouse.removeListener(mouse); Selection.setFocus(null);
    }

    static function reportClose():Void {
        _global.skse.SendModEvent("NWConversationClose_" + root.nwToken, input.text, root.nwGeneration);
    }

    static function close():Void {
        reportClose(); shutdown();
        _global.skse.CloseMenu("CustomMenu");
    }

    static function scroll(delta:Number):Void { history.scroll += delta; }

    static function inspectInventory():Void {
        if (selected != null || awaitingAdmission || pendingId != "" || root.nwToken == "") return;
        inventoryOpen = true; inventory._visible = true;
        var i:Number;
        for (i = 0; i < inventoryControls.length; i++) inventoryControls[i]._visible = true;
        Selection.setFocus(null); setBusy(busy);
        requestInventory(0);
    }

    static function requestInventory(page:Number):Void {
        if (!inventoryOpen || inventoryLoading) return;
        inventoryPage = Math.max(0, Math.min(page, inventoryPages - 1));
        inventoryRequest++; inventoryLoading = true;
        root.nwInventoryPage = inventoryPage; root.nwInventoryRequest = inventoryRequest;
        inventory.summary.text = "Reading Brann's inventory...";
        inventory.footer.text = "";
        var i:Number;
        for (i = 0; i < inventoryRows.length; i++) inventoryRows[i].text = "";
        _global.skse.SendModEvent("NWConversationInventory", root.nwToken, root.nwGeneration);
    }

    static function dismissInventory():Void {
        inventoryOpen = false; inventoryLoading = false; inventory._visible = false;
        var i:Number;
        for (i = 0; i < inventoryControls.length; i++) inventoryControls[i]._visible = false;
        setBusy(busy);
        if (!busy) Selection.setFocus(input);
    }

    static function main(mc:MovieClip):Void {
        root = mc; Stage.scaleMode = "showAll"; Stage.align = "";
        root.nwToken = ""; root.nwText = ""; root.nwSubmitted = ""; root.nwGeneration = 0;
        root.nwProtocol = 2;
        root.nwAcceptContract = ""; root.nwAcceptRevision = 0;
        offers = []; incomingOffers = []; offerCards = []; offerButtons = [];
        root.nwInventoryPage = 0; root.nwInventoryRequest = 0;
        panel(root, 0, 0, 1280, 720, 28);
        panel(root, 90, 194, 690, 316, 66);
        panel(root, 790, 194, 400, 316, 72);
        divider(root, 110, 148, 1060); divider(root, 110, 616, 1060);
        field("heading", 1, 110, 62, 680, 50, 36).text = "BRANN";
        field("location", 19, 113, 112, 630, 30, 18).text = "Warmaidens  /  Whiterun";
        inventoryButton = button("inventoryButton", 20, 920, 103, 250, "Inventory", inspectInventory);
        gold = field("gold", 2, 920, 66, 250, 32, 22);
        status = field("status", 3, 110, 157, 1060, 34, 18);
        status.text = "Connecting...";
        history = field("history", 4, 110, 208, 604, 250, 22);
        history.selectable = true;
        button("scrollUp", 5, 726, 208, 36, "^", function():Void { ConversationMenu.scroll(-5); });
        button("scrollDown", 6, 726, 416, 36, "v", function():Void { ConversationMenu.scroll(5); });
        pending = field("pending", 7, 110, 465, 652, 42, 17);
        offerCount = field("offerCount", 12, 810, 205, 360, 30, 20);
        offerCards.push(field("offer0", 13, 810, 240, 360, 70, 19));
        offerCards.push(field("offer1", 14, 810, 353, 360, 70, 19));
        offerButtons.push(button("review0", 15, 810, 310, 360, "Review offer", function():Void { ConversationMenu.review(0); }));
        offerButtons.push(button("review1", 16, 810, 423, 360, "Review offer", function():Void { ConversationMenu.review(1); }));
        button("offersPrev", 17, 810, 468, 170, "Previous", function():Void { ConversationMenu.pageOffers(-1); });
        button("offersNext", 18, 1000, 468, 170, "Next", function():Void { ConversationMenu.pageOffers(1); });
        field("prompt", 21, 110, 518, 1060, 26, 18).text = "What would you like to say?";
        input = field("input", 8, 110, 547, 1060, 62, 22);
        input.type = "dynamic"; input.maxChars = 500;
        input.selectable = true;
        panel(root, 110, 547, 1060, 62, 70);
        input.onChanged = function():Void {
            if (Key.isDown(Key.ENTER) && !Key.isDown(Key.SHIFT)) {
                var text:String = ConversationMenu.input.text;
                if (text.substr(-2) == "\r\n") text = text.substr(0, text.length - 2);
                else if (text.substr(-1) == "\r" || text.substr(-1) == "\n") text = text.substr(0, text.length - 1);
                ConversationMenu.input.text = text;
            }
            ConversationMenu.root.nwText = ConversationMenu.input.text;
        };
        sendButton = button("sendButton", 9, 110, 633, 145, "[Enter] Say", send);
        button("closeButton", 10, 1015, 633, 155, "[Esc] Exit", close);
        field("hint", 11, 280, 634, 710, 45, 17).text = "Shift+Enter  New line     /     Wheel or Page Up / Down  Conversation";
        confirmation = root.createEmptyMovieClip("confirmation", 40);
        panel(confirmation, 0, 0, 1280, 720, 94);
        divider(confirmation, 220, 162, 840); divider(confirmation, 220, 490, 840);
        // Capture clicks on the modal backdrop so underlying offer/history controls cannot activate.
        confirmation.onRelease = function():Void {};
        confirmation.useHandCursor = false;
        confirmation.createTextField("title", 1, 220, 175, 840, 45);
        confirmation.title.setNewTextFormat(new TextFormat("$EverywhereFont", 28, 0xe8e8e8));
        confirmation.title.text = "Confirm this offer"; confirmation.title.selectable = false;
        confirmation.createTextField("details", 2, 220, 230, 840, 195);
        confirmation.details.setNewTextFormat(new TextFormat("$EverywhereFont", 23, 0xe8e8e8));
        confirmation.details.multiline = true; confirmation.details.wordWrap = true; confirmation.details.html = false;
        confirmation.createTextField("hint", 3, 220, 440, 840, 45);
        confirmation.hint.setNewTextFormat(new TextFormat("$EverywhereFont", 18, 0xe8e8e8));
        confirmation.hint.text = "Confirm purchase to accept these terms. Your items arrive when Skyrim confirms the exchange.";
        confirmation.hint.multiline = true; confirmation.hint.wordWrap = true;
        confirmButton = button("confirmPurchase", 41, 220, 510, 365, "Confirm purchase", confirm);
        cancelButton = button("cancelPurchase", 42, 695, 510, 365, "Back", dismissConfirmation);
        confirmation._visible = false; confirmButton._visible = false; cancelButton._visible = false;
        inventory = root.createEmptyMovieClip("inventory", 50);
        panel(inventory, 0, 0, 1280, 720, 96);
        divider(inventory, 180, 169, 920); divider(inventory, 180, 586, 920);
        inventory.onRelease = function():Void {}; inventory.useHandCursor = false;
        childField(inventory, "title", 1, 195, 111, 900, 50, 34).text = "BRANN'S INVENTORY";
        childField(inventory, "summary", 2, 195, 184, 900, 38, 22);
        childField(inventory, "columnItem", 3, 195, 238, 515, 30, 18).text = "ITEM";
        childField(inventory, "columnCount", 6, 725, 238, 100, 30, 18).text = "QTY";
        childField(inventory, "columnWeight", 7, 850, 238, 100, 30, 18).text = "WEIGHT";
        childField(inventory, "columnValue", 8, 995, 238, 100, 30, 18).text = "VALUE";
        inventoryRows = []; inventoryControls = [];
        var row:Number;
        for (row = 0; row < 8; row++) {
            inventoryRows.push(childField(inventory, "item" + row, 10 + row * 4, 195, 279 + row * 34, 515, 32, 22));
            inventoryRows.push(childField(inventory, "count" + row, 11 + row * 4, 725, 279 + row * 34, 100, 32, 22));
            inventoryRows.push(childField(inventory, "weight" + row, 12 + row * 4, 850, 279 + row * 34, 100, 32, 22));
            inventoryRows.push(childField(inventory, "value" + row, 13 + row * 4, 995, 279 + row * 34, 100, 32, 22));
        }
        childField(inventory, "footer", 4, 195, 554, 900, 28, 18);
        childField(inventory, "note", 5, 195, 663, 920, 32, 16).text = "Items carried in Skyrim. Read only. Weight and value are per base item; enchanted or improved copies share a row.";
        inventoryControls.push(button("inventoryPrev", 51, 195, 607, 180, "Previous", function():Void { ConversationMenu.requestInventory(ConversationMenu.inventoryPage - 1); }));
        inventoryControls.push(button("inventoryNext", 52, 395, 607, 180, "Next", function():Void { ConversationMenu.requestInventory(ConversationMenu.inventoryPage + 1); }));
        inventoryControls.push(button("inventoryRefresh", 53, 680, 607, 180, "Refresh", function():Void { ConversationMenu.requestInventory(ConversationMenu.inventoryPage); }));
        inventoryControls.push(button("inventoryBack", 54, 880, 607, 215, "[Esc] Back", dismissInventory));
        dismissInventory();
        keys = new Object();
        keys.onKeyDown = function():Void {
            var code:Number = Key.getCode();
            if (ConversationMenu.inventoryOpen) {
                if (code == Key.ESCAPE) ConversationMenu.dismissInventory();
                else if (code == Key.PGUP) ConversationMenu.requestInventory(ConversationMenu.inventoryPage - 1);
                else if (code == Key.PGDN) ConversationMenu.requestInventory(ConversationMenu.inventoryPage + 1);
                return;
            }
            if (code == Key.ESCAPE) ConversationMenu.close();
            else if (code == Key.PGUP) ConversationMenu.scroll(-7);
            else if (code == Key.PGDN) ConversationMenu.scroll(7);
            else if (code == Key.ENTER && !Key.isDown(Key.SHIFT)) ConversationMenu.send();
        };
        Key.addListener(keys);
        mouse = new Object();
        mouse.onMouseWheel = function(delta:Number):Void {
            if (ConversationMenu.selected == null && !ConversationMenu.inventoryOpen && ConversationMenu.root._xmouse >= 110 && ConversationMenu.root._xmouse <= 762 && ConversationMenu.root._ymouse >= 208 && ConversationMenu.root._ymouse <= 458) ConversationMenu.scroll(-delta * 3);
        };
        Mouse.addListener(mouse);
        root.nwInitialize = function(token:String, generation:String, draft:String):Void {
            ConversationMenu.root.nwToken = token; ConversationMenu.root.nwGeneration = Number(generation);
            ConversationMenu.input.text = draft; ConversationMenu.root.nwText = draft;
            if (!ConversationMenu.captured) { _global.skse.AllowTextInput(true); ConversationMenu.captured = true; }
            Selection.setFocus(ConversationMenu.input);
        };
        root.nwInventoryBegin = function(token:String, request:String, page:String, pages:String, gold:String):Void {
            if (token != ConversationMenu.root.nwToken || !ConversationMenu.inventoryOpen || !ConversationMenu.inventoryLoading || Number(request) != ConversationMenu.inventoryRequest) return;
            ConversationMenu.inventoryPage = Number(page); ConversationMenu.inventoryPages = Number(pages);
            ConversationMenu.inventory.summary.text = "Gold: " + gold + "    /    Carried in Skyrim";
            ConversationMenu.inventory.footer.text = "Page " + (Number(page) + 1) + " / " + pages;
        };
        root.nwInventoryItem = function(token:String, request:String, slot:String, name:String, count:String, weight:String, value:String):Void {
            if (token != ConversationMenu.root.nwToken || !ConversationMenu.inventoryOpen || !ConversationMenu.inventoryLoading || Number(request) != ConversationMenu.inventoryRequest) return;
            var index:Number = Number(slot);
            if (index < 0 || index >= 8 || index != Math.floor(index)) return;
            ConversationMenu.inventoryRows[index * 4].text = name;
            ConversationMenu.inventoryRows[index * 4 + 1].text = count;
            ConversationMenu.inventoryRows[index * 4 + 2].text = weight;
            ConversationMenu.inventoryRows[index * 4 + 3].text = value;
        };
        root.nwInventoryEnd = function(token:String, request:String, message:String):Void {
            if (token != ConversationMenu.root.nwToken || !ConversationMenu.inventoryOpen || !ConversationMenu.inventoryLoading || Number(request) != ConversationMenu.inventoryRequest) return;
            ConversationMenu.inventoryLoading = false;
            if (message != "") {
                ConversationMenu.inventory.summary.text = "Inventory unavailable";
                ConversationMenu.inventory.footer.text = message;
            } else if (ConversationMenu.inventoryRows[0].text == "") {
                ConversationMenu.inventoryRows[0].text = "No items on this page.";
            }
        };
        root.nwReceive = function(token:String, message:String, locked:String, gold:String, support:String, command:String, state:String):Void {
            if (token != ConversationMenu.root.nwToken) return;
            ConversationMenu.status.text = message + (support == "" ? "" : " [" + support + "]");
            ConversationMenu.gold.text = gold + " gold";
            ConversationMenu.playerGold = Number(gold);
            if (command == "" && !ConversationMenu.awaitingAdmission) {
                ConversationMenu.pendingId = ""; ConversationMenu.pendingText = ""; ConversationMenu.pending.text = "";
            }
            if (state == "transfer_pending") ConversationMenu.pending.text = "Applying inventory transfer; waiting for acknowledgement...";
            var wasBusy:Boolean = ConversationMenu.busy;
            ConversationMenu.setBusy(locked.toLowerCase() == "true");
            if (ConversationMenu.selected != null && (ConversationMenu.busy || ConversationMenu.selected.total > ConversationMenu.playerGold)) {
                ConversationMenu.dismissConfirmation();
                ConversationMenu.status.text = message + " — confirmation closed; review current offers again.";
            }
            if (wasBusy && !ConversationMenu.busy && !ConversationMenu.inventoryOpen) Selection.setFocus(ConversationMenu.input);
        };
        root.nwHistory = function(token:String, transcript:String, revision:String):Void {
            if (token != ConversationMenu.root.nwToken || transcript == ConversationMenu.history.text) return;
            var atEnd:Boolean = ConversationMenu.history.scroll >= ConversationMenu.history.maxscroll - 1;
            var previous:Number = ConversationMenu.history.scroll;
            ConversationMenu.history.text = transcript;
            ConversationMenu.history.scroll = atEnd ? ConversationMenu.history.maxscroll : previous;
        };
        root.nwPending = function(token:String, id:String, text:String, kind:String):Void {
            if (token != ConversationMenu.root.nwToken) return;
            ConversationMenu.awaitingAdmission = false;
            ConversationMenu.pendingId = id; ConversationMenu.pendingText = text;
            ConversationMenu.pendingKind = kind == "accept" ? "accept" : "say";
            ConversationMenu.pending.text = id == "" ? "" : (ConversationMenu.pendingKind == "accept" ? "Accepting selected offer..." : "You (sending): " + text);
        };
        root.nwCommand = function(token:String, id:String, outcome:String):Void {
            if (token != ConversationMenu.root.nwToken || id != ConversationMenu.pendingId) return;
            if (outcome == "completed" && ConversationMenu.pendingKind == "say" && ConversationMenu.input.text == ConversationMenu.pendingText) {
                ConversationMenu.input.text = ""; ConversationMenu.root.nwText = "";
            }
            ConversationMenu.awaitingAdmission = false;
            ConversationMenu.pendingId = ""; ConversationMenu.pendingText = ""; ConversationMenu.pending.text = "";
        };
        root.nwOffersBegin = function(token:String, revision:String):Void {
            if (token != ConversationMenu.root.nwToken) return;
            ConversationMenu.incomingOffers = []; ConversationMenu.offerRevision = revision;
        };
        root.nwOffer = function(token:String, contract:String, revision:String, item:String, quantity:String, unit:String, total:String):Void {
            if (token != ConversationMenu.root.nwToken || ConversationMenu.incomingOffers.length >= 8) return;
            ConversationMenu.incomingOffers.push({ contract:contract, revision:Number(revision), item:item, quantity:Number(quantity), unit:Number(unit), total:Number(total) });
        };
        root.nwOffersEnd = function(token:String, revision:String):Void {
            if (token != ConversationMenu.root.nwToken || revision != ConversationMenu.offerRevision) return;
            ConversationMenu.offers = ConversationMenu.incomingOffers;
            if (ConversationMenu.selected != null) {
                var valid:Boolean = false;
                var i:Number;
                for (i = 0; i < ConversationMenu.offers.length; i++) {
                    var o:Object = ConversationMenu.offers[i];
                    var s:Object = ConversationMenu.selected;
                    if (o.contract == s.contract && o.revision == s.revision && o.item == s.item && o.quantity == s.quantity && o.unit == s.unit && o.total == s.total) valid = true;
                }
                if (!valid) {
                    ConversationMenu.dismissConfirmation();
                    ConversationMenu.status.text = "Offer changed or withdrawn. Review the current terms before accepting.";
                }
            }
            ConversationMenu.renderOffers();
        };
        root.nwShutdown = shutdown;
        root.onUnload = function():Void { ConversationMenu.reportClose(); ConversationMenu.shutdown(); };
        setBusy(true);
        root.nwLoaded = true;
    }
}
