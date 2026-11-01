// AS2 / Flash 8, compiled with pinned MTASC. Diagnostic UI, not the conversation release.
class ConversationProbe {
    static var root:MovieClip;
    static var input:TextField;
    static var status:TextField;
    static var output:TextField;
    static var keys:Object;
    static var captured:Boolean = false;
    static var busy:Boolean = false;
    static var sendButton:MovieClip;

    static function field(name:String, depth:Number, x:Number, y:Number, w:Number, h:Number, size:Number):TextField {
        root.createTextField(name, depth, x, y, w, h);
        var f:TextField = root[name];
        var fmt:TextFormat = new TextFormat("$EverywhereFont", size, 0xeee2cc);
        f.setNewTextFormat(fmt);
        f.multiline = true;
        f.wordWrap = true;
        f.html = false;
        return f;
    }

    static function button(name:String, depth:Number, x:Number, label:String, action:Function):MovieClip {
        var b:MovieClip = root.createEmptyMovieClip(name, depth);
        b._x = x; b._y = 565;
        b.beginFill(0x514b40, 100);
        b.moveTo(0, 0); b.lineTo(190, 0); b.lineTo(190, 46); b.lineTo(0, 46); b.lineTo(0, 0); b.endFill();
        b.createTextField("label", 1, 12, 8, 174, 36);
        b.label.setNewTextFormat(new TextFormat("$EverywhereFont", 21, 0xeee2cc));
        b.label.text = label; b.label.selectable = false;
        b.onRelease = action;
        return b;
    }

    static function send():Void {
        if (busy || root.nwToken == "" || input.text.split(" ").join("").split("\r").join("").split("\n").join("") == "") return;
        root.nwText = input.text;
        root.nwSubmitted = input.text;
        busy = true;
        status.text = "Sending UI event to Papyrus...";
        _global.skse.SendModEvent("NWSpikeSend", root.nwToken, root.nwGeneration);
    }

    static function shutdown():Void {
        if (captured) {
            _global.skse.AllowTextInput(false);
            captured = false;
        }
        Key.removeListener(keys);
        Selection.setFocus(null);
    }

    static function close():Void {
        // Release text capture immediately, even when Papyrus callbacks are delayed.
        shutdown();
        _global.skse.SendModEvent("NWSpikeClose_" + root.nwToken, input.text, root.nwGeneration);
        _global.skse.CloseMenu("CustomMenu");
    }

    static function main(mc:MovieClip):Void {
        root = mc;
        Stage.scaleMode = "showAll";
        Stage.align = "";
        root.nwToken = "";
        root.nwText = "";
        root.nwSubmitted = "";
        root.nwGeneration = 0;
        root.beginFill(0x171817, 96);
        root.lineStyle(2, 0x8f826b, 100);
        root.moveTo(170, 70); root.lineTo(1110, 70); root.lineTo(1110, 650); root.lineTo(170, 650); root.lineTo(170, 70); root.endFill();
        field("heading", 1, 205, 90, 860, 45, 30).text = "Brann — menu feasibility probe";
        field("hint", 2, 205, 145, 860, 65, 19).text = "HTTP echo only. F8/browser still handles dialogue and trade.\nEnter sends; Shift+Enter adds a line; Esc closes. Maximum 500 characters.";
        status = field("status", 3, 205, 215, 860, 70, 19);
        status.text = "Waiting for Papyrus initialization...";
        output = field("output", 4, 205, 290, 860, 120, 21);
        input = field("input", 5, 205, 425, 860, 115, 23);
        input.type = "input"; input.maxChars = 500;
        input.background = true; input.backgroundColor = 0x30312e;
        input.border = true; input.borderColor = 0x8f826b;
        input.onChanged = function():Void {
            // Flash's input field may process Enter after the Key listener. Remove only
            // that plain-Enter insertion; Shift+Enter and pasted line breaks remain text.
            if (Key.isDown(Key.ENTER) && !Key.isDown(Key.SHIFT)) {
                var text:String = ConversationProbe.input.text;
                if (text.substr(-2) == "\r\n") text = text.substr(0, text.length - 2);
                else if (text.substr(-1) == "\r" || text.substr(-1) == "\n") text = text.substr(0, text.length - 1);
                ConversationProbe.input.text = text;
            }
            ConversationProbe.root.nwText = ConversationProbe.input.text;
        };
        sendButton = button("sendButton", 6, 205, "Send probe", send);
        button("closeButton", 7, 875, "Close", close);
        keys = new Object();
        keys.onKeyDown = function():Void {
            var code:Number = Key.getCode();
            if (code == Key.ESCAPE) ConversationProbe.close();
            else if (code == Key.ENTER && !Key.isDown(Key.SHIFT)) ConversationProbe.send();
        };
        Key.addListener(keys);
        root.nwInitialize = function(token:String, generation:String, draft:String):Void {
            ConversationProbe.root.nwToken = token;
            ConversationProbe.root.nwGeneration = Number(generation);
            ConversationProbe.input.text = draft;
            ConversationProbe.root.nwText = draft;
            if (!ConversationProbe.captured) {
                _global.skse.AllowTextInput(true);
                ConversationProbe.captured = true;
            }
            Selection.setFocus(ConversationProbe.input);
            ConversationProbe.status.text = "Papyrus initialized. Waiting for HTTP callback...";
        };
        root.nwReceive = function(token:String, message:String, echo:String, locked:String):Void {
            if (token != ConversationProbe.root.nwToken) return;
            ConversationProbe.status.text = message;
            ConversationProbe.output.text = echo;
            ConversationProbe.busy = locked.toLowerCase() == "true";
            ConversationProbe.sendButton._alpha = ConversationProbe.busy ? 45 : 100;
        };
        root.nwShutdown = shutdown;
        root.onUnload = function():Void {
            _global.skse.SendModEvent("NWSpikeClose_" + ConversationProbe.root.nwToken,
                ConversationProbe.input.text, ConversationProbe.root.nwGeneration);
            ConversationProbe.shutdown();
        };
        root.nwLoaded = true;
    }
}
