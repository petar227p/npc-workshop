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

    static function field(name:String, depth:Number, x:Number, y:Number, w:Number, h:Number, size:Number):TextField {
        root.createTextField(name, depth, x, y, w, h);
        var f:TextField = root[name];
        f.setNewTextFormat(new TextFormat("$EverywhereFont", size, 0xeee2cc));
        f.multiline = true; f.wordWrap = true; f.html = false;
        return f;
    }

    static function button(name:String, depth:Number, x:Number, y:Number, w:Number, label:String, action:Function):MovieClip {
        var b:MovieClip = root.createEmptyMovieClip(name, depth);
        b._x = x; b._y = y;
        b.beginFill(0x514b40, 100);
        b.moveTo(0, 0); b.lineTo(w, 0); b.lineTo(w, 40); b.lineTo(0, 40); b.lineTo(0, 0); b.endFill();
        b.createTextField("label", 1, 10, 7, w - 14, 30);
        b.label.setNewTextFormat(new TextFormat("$EverywhereFont", 20, 0xeee2cc));
        b.label.text = label; b.label.selectable = false; b.onRelease = action;
        return b;
    }

    static function setBusy(locked:Boolean):Void {
        busy = locked || awaitingAdmission;
        sendButton._alpha = busy || selected != null ? 40 : 100;
        input.type = busy || selected != null ? "dynamic" : "input";
        renderOffers();
    }

    static function send():Void {
        if (busy || selected != null || root.nwToken == "" || input.text.split(" ").join("").split("\t").join("").split("\r").join("").split("\n").join("") == "") return;
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
        if (selected != null) return;
        offerPage = Math.max(0, Math.min(offerPage + delta, Math.ceil(offers.length / 2) - 1));
        renderOffers();
    }

    static function review(index:Number):Void {
        var o:Object = offers[offerPage * 2 + index];
        if (busy || selected != null || o == undefined || o.total > playerGold || root.nwToken == "") return;
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

    static function main(mc:MovieClip):Void {
        root = mc; Stage.scaleMode = "showAll"; Stage.align = "";
        root.nwToken = ""; root.nwText = ""; root.nwSubmitted = ""; root.nwGeneration = 0;
        root.nwProtocol = 2;
        root.nwAcceptContract = ""; root.nwAcceptRevision = 0;
        offers = []; incomingOffers = []; offerCards = []; offerButtons = [];
        root.beginFill(0x171817, 96); root.lineStyle(2, 0x8f826b, 100);
        root.moveTo(150, 45); root.lineTo(1130, 45); root.lineTo(1130, 675); root.lineTo(150, 675); root.lineTo(150, 45); root.endFill();
        field("heading", 1, 185, 62, 650, 44, 32).text = "Brann — Warmaidens";
        gold = field("gold", 2, 885, 76, 210, 32, 20);
        status = field("status", 3, 185, 114, 900, 52, 19);
        status.text = "Connecting...";
        history = field("history", 4, 185, 174, 490, 250, 22);
        history.background = true; history.backgroundColor = 0x22231f;
        button("scrollUp", 5, 685, 174, 58, "Up", function():Void { ConversationMenu.scroll(-5); });
        button("scrollDown", 6, 685, 384, 58, "Dn", function():Void { ConversationMenu.scroll(5); });
        pending = field("pending", 7, 185, 433, 558, 48, 18);
        offerCount = field("offerCount", 12, 765, 170, 330, 32, 20);
        offerCards.push(field("offer0", 13, 765, 207, 330, 70, 19));
        offerCards.push(field("offer1", 14, 765, 325, 330, 70, 19));
        offerButtons.push(button("review0", 15, 765, 279, 330, "Review offer", function():Void { ConversationMenu.review(0); }));
        offerButtons.push(button("review1", 16, 765, 397, 330, "Review offer", function():Void { ConversationMenu.review(1); }));
        button("offersPrev", 17, 765, 443, 155, "Previous", function():Void { ConversationMenu.pageOffers(-1); });
        button("offersNext", 18, 940, 443, 155, "Next", function():Void { ConversationMenu.pageOffers(1); });
        input = field("input", 8, 185, 489, 910, 95, 22);
        input.type = "dynamic"; input.maxChars = 500;
        input.background = true; input.backgroundColor = 0x30312e;
        input.border = true; input.borderColor = 0x8f826b;
        input.onChanged = function():Void {
            if (Key.isDown(Key.ENTER) && !Key.isDown(Key.SHIFT)) {
                var text:String = ConversationMenu.input.text;
                if (text.substr(-2) == "\r\n") text = text.substr(0, text.length - 2);
                else if (text.substr(-1) == "\r" || text.substr(-1) == "\n") text = text.substr(0, text.length - 1);
                ConversationMenu.input.text = text;
            }
            ConversationMenu.root.nwText = ConversationMenu.input.text;
        };
        sendButton = button("sendButton", 9, 185, 601, 150, "Send", send);
        button("closeButton", 10, 945, 601, 150, "Close", close);
        field("hint", 11, 350, 603, 575, 52, 17).text = "Enter: send  |  Shift+Enter: new line  |  Esc: close\nScroll history: wheel, Up/Dn buttons or Page Up/Down";
        confirmation = root.createEmptyMovieClip("confirmation", 40);
        confirmation.beginFill(0x11120f, 100); confirmation.lineStyle(2, 0x8f826b, 100);
        confirmation.moveTo(175, 155); confirmation.lineTo(1105, 155); confirmation.lineTo(1105, 590); confirmation.lineTo(175, 590); confirmation.lineTo(175, 155); confirmation.endFill();
        // Capture clicks on the modal backdrop so underlying offer/history controls cannot activate.
        confirmation.onRelease = function():Void {};
        confirmation.useHandCursor = false;
        confirmation.createTextField("title", 1, 220, 175, 840, 45);
        confirmation.title.setNewTextFormat(new TextFormat("$EverywhereFont", 28, 0xeee2cc));
        confirmation.title.text = "Confirm this offer"; confirmation.title.selectable = false;
        confirmation.createTextField("details", 2, 220, 230, 840, 195);
        confirmation.details.setNewTextFormat(new TextFormat("$EverywhereFont", 23, 0xeee2cc));
        confirmation.details.multiline = true; confirmation.details.wordWrap = true; confirmation.details.html = false;
        confirmation.createTextField("hint", 3, 220, 440, 840, 45);
        confirmation.hint.setNewTextFormat(new TextFormat("$EverywhereFont", 18, 0xeee2cc));
        confirmation.hint.text = "Click Confirm purchase to accept. Delivery is complete only after inventory acknowledgement.";
        confirmation.hint.multiline = true; confirmation.hint.wordWrap = true;
        confirmButton = button("confirmPurchase", 41, 220, 510, 365, "Confirm purchase", confirm);
        cancelButton = button("cancelPurchase", 42, 695, 510, 365, "Back", dismissConfirmation);
        confirmation._visible = false; confirmButton._visible = false; cancelButton._visible = false;
        keys = new Object();
        keys.onKeyDown = function():Void {
            var code:Number = Key.getCode();
            if (code == Key.ESCAPE) ConversationMenu.close();
            else if (code == Key.PGUP) ConversationMenu.scroll(-7);
            else if (code == Key.PGDN) ConversationMenu.scroll(7);
            else if (code == Key.ENTER && !Key.isDown(Key.SHIFT)) ConversationMenu.send();
        };
        Key.addListener(keys);
        mouse = new Object();
        mouse.onMouseWheel = function(delta:Number):Void {
            if (ConversationMenu.selected == null && ConversationMenu.root._xmouse <= 743 && ConversationMenu.root._ymouse >= 174 && ConversationMenu.root._ymouse <= 424) ConversationMenu.scroll(-delta * 3);
        };
        Mouse.addListener(mouse);
        root.nwInitialize = function(token:String, generation:String, draft:String):Void {
            ConversationMenu.root.nwToken = token; ConversationMenu.root.nwGeneration = Number(generation);
            ConversationMenu.input.text = draft; ConversationMenu.root.nwText = draft;
            if (!ConversationMenu.captured) { _global.skse.AllowTextInput(true); ConversationMenu.captured = true; }
            Selection.setFocus(ConversationMenu.input);
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
            if (wasBusy && !ConversationMenu.busy) Selection.setFocus(ConversationMenu.input);
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
