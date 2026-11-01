Scriptname NWBridgeQuest extends Quest

Actor Property Brann Auto
Form Gold
Form Dagger
String Session
String Ack = ""
String LastPlan = ""
Int Request = 0
Bool Waiting = False
Bool Failed = False
Bool Enabled = False
Bool RecoveryRequired = False
; Brann activation opens the conversation; F9/F8 remain diagnostic shortcuts.
Int MenuGeneration = 0
Int RequestGeneration = 0
String MenuToken = ""
String Draft = ""
Bool NativeTransport = False
Bool NativeConnected = False
Bool ServerBusy = False
Bool MenuReady = False
Int CommandSerial = 0
String PendingCommand = ""
String LastCommandId = ""
String LastCommandOutcome = ""
String QueuedText = ""
String QueuedKind = ""
String QueuedContract = ""
Int QueuedRevision = 0
Bool CommandQueued = False
String[] OfferContracts
Int[] OfferRevisions
String[] OfferItems
Int[] OfferQuantities
Float[] OfferUnits
Int[] OfferTotals
Int OfferCount = 0
String ConversationState = "connecting"
String History = ""
String ConversationStatus = "Connecting — new loaded session; previous conversation cleared."
String SupportCode = ""
Int PlayerGold = 0
Int SnapshotRevision = -1
Bool MenuRequested = False
Bool MenuDriver = False

Event OnInit()
    BeginSession()
EndEvent

Function BeginSession()
    CloseConversationMenu()
    UnregisterForUpdate()
    UnregisterForAllKeys()
    UnregisterForAllModEvents()
    Gold = Game.GetFormFromFile(0x00000F, "Skyrim.esm")
    Dagger = Game.GetFormFromFile(0x01397E, "Skyrim.esm")
    Session = Utility.RandomInt(1, 2000000000) + "_" + Utility.RandomInt(1, 2000000000)
    Request = 0
    Ack = ""
    LastPlan = ""
    Failed = False
    Waiting = False
    Enabled = False
    RecoveryRequired = False
    MenuToken = ""
    Draft = ""
    NativeTransport = False
    NativeConnected = False
    ServerBusy = False
    MenuReady = False
    CommandSerial = 0
    PendingCommand = ""
    LastCommandId = ""
    LastCommandOutcome = ""
    QueuedText = ""
    QueuedKind = ""
    QueuedContract = ""
    QueuedRevision = 0
    CommandQueued = False
    OfferContracts = new String[8]
    OfferRevisions = new Int[8]
    OfferItems = new String[8]
    OfferQuantities = new Int[8]
    OfferUnits = new Float[8]
    OfferTotals = new Int[8]
    OfferCount = 0
    ConversationState = "connecting"
    History = ""
    SnapshotRevision = -1
    ConversationStatus = "Connecting — new loaded session; previous conversation cleared."
    SupportCode = ""
    PlayerGold = Game.GetPlayer().GetItemCount(Gold)
    RegisterForKey(66) ; F8, DirectInput scan code
    RegisterForKey(67) ; F9 diagnostic fallback for the same conversation menu
    RegisterForMenu("CustomMenu")
    RegisterForModEvent("NWConversationSend", "OnConversationSend")
    RegisterForModEvent("NWConversationAccept", "OnConversationAccept")
    RegisterForModEvent("SKSE_HTTP_OnHttpReplyReceived", "OnReply")
    RegisterForModEvent("SKSE_HTTP_OnHttpErrorReceived", "OnHttpError")
    ; Reapply the reference's default-activation block after every save load,
    ; including existing test saves where the actor's OnInit will not rerun.
    NWBrannActor activation = Brann as NWBrannActor
    If activation != None
        activation.PrepareActivation(Self)
    ElseIf Brann != None
        Debug.Notification("NPC Workshop: Brann activation script missing. Reinstall the complete package; F9 is available for diagnostics.")
    EndIf
    Debug.Notification("NPC Workshop: activate Brann to talk; F9/F8 diagnostics.")
EndFunction

Function ActivateConversation(Actor target, ObjectReference actionRef)
    ; Validate both ends even if another script invokes this public entry point.
    If target != Brann || target == None || actionRef != Game.GetPlayer()
        Return
    EndIf
    OpenConversationMenu()
EndFunction

Event OnKeyDown(Int keyCode)
    If keyCode == 67 && !Utility.IsInMenuMode() && !UI.IsTextInputEnabled()
        OpenConversationMenu()
    ElseIf keyCode == 66 && !Utility.IsInMenuMode() && !UI.IsTextInputEnabled()
        If !Enabled && !RecoveryRequired
            Enabled = True
            RegisterForSingleUpdate(0.1)
        EndIf
    EndIf
EndEvent

Bool Function NearSmith()
    Actor p = Game.GetPlayer()
    Return Brann != None && !Brann.IsDead() && !p.IsDead() && !Brann.IsInCombat() && !p.IsInCombat() && p.GetDistance(Brann) < 400.0
EndFunction

Event OnUpdate()
    If MenuDriver
        Return
    EndIf
    SendPoll()
EndEvent

Function SendPoll()
    If !Enabled || Waiting
        Return
    EndIf
    ; Reserve before any latent native calls. The callback holds this through inventory application.
    Waiting = True
    If Brann == None || Gold == None || Dagger == None
        Debug.MessageBox("NPC Workshop: missing quest properties/forms. Check mod setup.")
        Enabled = False
        Waiting = False
        Return
    EndIf
    Request += 1
    Int h = SKSE_HTTP.createDictionary()
    SKSE_HTTP.setString(h, "session", Session)
    SKSE_HTTP.setInt(h, "request", Request)
    SKSE_HTTP.setBool(h, "near", NearSmith())
    SKSE_HTTP.setString(h, "ack", Ack)
    SKSE_HTTP.setBool(h, "failed", Failed)
    Actor p = Game.GetPlayer()
    SKSE_HTTP.setInt(h, "pgold", p.GetItemCount(Gold))
    SKSE_HTTP.setInt(h, "sgold", Brann.GetItemCount(Gold))
    SKSE_HTTP.setInt(h, "pitem", p.GetItemCount(Dagger))
    SKSE_HTTP.setInt(h, "sitem", Brann.GetItemCount(Dagger))
    RequestGeneration = 0
    If NativeTransport
        RequestGeneration = MenuGeneration
        SKSE_HTTP.setInt(h, "version", 2)
        SKSE_HTTP.setInt(h, "generation", RequestGeneration)
        If CommandQueued && NativeConnected
            Int command = SKSE_HTTP.createDictionary()
            SKSE_HTTP.setString(command, "id", PendingCommand)
            SKSE_HTTP.setString(command, "kind", QueuedKind)
            If QueuedKind == "accept"
                SKSE_HTTP.setString(command, "contract", QueuedContract)
                SKSE_HTTP.setInt(command, "revision", QueuedRevision)
            Else
                SKSE_HTTP.setString(command, "text", QueuedText)
            EndIf
            SKSE_HTTP.setNestedDictionary(h, "command", command)
            CommandQueued = False ; Send once. A timeout must never create another mutation.
            If QueuedKind == "accept"
                ConversationStatus = "Accepting selected offer; awaiting checked transfer..."
            Else
                ConversationStatus = "Brann is thinking..."
            EndIf
            PublishConversation()
        EndIf
        SKSE_HTTP.sendLocalhostHttpRequest(h, 8788, "skyrim/v2/poll", 5000)
    Else
        SKSE_HTTP.sendLocalhostHttpRequest(h, 8788, "skyrim/poll", 5000)
    EndIf
    ; No timed mutation retry: an ambiguous network failure requires a save reload.
EndFunction

Bool Function CountsMatch(Int h, String prefix)
    Actor p = Game.GetPlayer()
    Return p.GetItemCount(Gold) == SKSE_HTTP.getInt(h, prefix + "pgold", -1) && Brann.GetItemCount(Gold) == SKSE_HTTP.getInt(h, prefix + "sgold", -1) && p.GetItemCount(Dagger) == SKSE_HTTP.getInt(h, prefix + "pitem", -1) && Brann.GetItemCount(Dagger) == SKSE_HTTP.getInt(h, prefix + "sitem", -1)
EndFunction

Event OnReply(Int h)
    If SKSE_HTTP.getString(h, "bridge") != "npc-workshop" || SKSE_HTTP.getString(h, "session") != Session || SKSE_HTTP.getInt(h, "request") != Request || !Waiting
        Return
    EndIf
    ReadConversation(h)
    If SKSE_HTTP.getBool(h, "reset")
        RecoveryRequired = True
        Enabled = False
        Waiting = False
        PublishStatus("Recovery required. Close and reload a known save.", "", True)
        If !OwnsConversationMenu()
            Debug.MessageBox(SKSE_HTTP.getString(h, "message") + " Reload a known save to reconnect.")
        EndIf
        Return
    EndIf
    If RecoveryRequired
        Waiting = False
        Return
    EndIf
    String plan = SKSE_HTTP.getString(h, "plan")
    If plan != ""
        If plan == LastPlan
            Ack = plan
        ElseIf NearSmith() && CountsMatch(h, "before_")
            Int price = SKSE_HTTP.getInt(h, "before_pgold") - SKSE_HTTP.getInt(h, "after_pgold")
            Int qty = SKSE_HTTP.getInt(h, "after_pitem") - SKSE_HTTP.getInt(h, "before_pitem")
            ; Check both conservation equations and bounds before any RemoveItem.
            If price >= 0 && qty > 0 && SKSE_HTTP.getInt(h, "after_sgold") == SKSE_HTTP.getInt(h, "before_sgold") + price && SKSE_HTTP.getInt(h, "after_sitem") == SKSE_HTTP.getInt(h, "before_sitem") - qty
                LastPlan = plan ; persisted in Skyrim save with the inventory
                If price > 0
                    Game.GetPlayer().RemoveItem(Gold, price, True, Brann)
                EndIf
                Brann.RemoveItem(Dagger, qty, True, Game.GetPlayer())
                If CountsMatch(h, "after_")
                    Ack = plan
                    Debug.Notification("NPC Workshop: trade applied; awaiting acknowledgement.")
                Else
                    Failed = True
                EndIf
            Else
                Failed = True
            EndIf
        Else
            Failed = True
        EndIf
    Else
        Ack = ""
        String line = SKSE_HTTP.getString(h, "message")
        If line != "" && !NativeTransport
            Debug.Notification(line)
        EndIf
    EndIf
    Waiting = False
    If !MenuDriver
        RegisterForSingleUpdate(2.0)
    EndIf
EndEvent

Event OnHttpError(Int h)
    If Waiting
        RecoveryRequired = True
        Enabled = False
        Waiting = False
        PublishStatus("HTTP failed; outcome unknown. Reload a known save.", "", True)
        If !OwnsConversationMenu()
            Debug.MessageBox("NPC Workshop: HTTP failed. Check local servers and reload a known save. An action may already have committed.")
        EndIf
    EndIf
EndEvent

Bool Function OwnsConversationMenu()
    Return MenuRequested && UI.IsMenuOpen("CustomMenu") && UI.GetString("CustomMenu", "_root.nwToken") == MenuToken
EndFunction

Function OpenConversationMenu()
    If MenuRequested
        Return ; Repeated activation must not replace or initialize a second menu.
    EndIf
    If UI.IsMenuOpen("CustomMenu")
        Debug.Notification("NPC Workshop: another custom menu is open.")
        Return
    EndIf
    If Utility.IsInMenuMode() || UI.IsTextInputEnabled()
        Debug.Notification("NPC Workshop: close the current menu before talking to Brann.")
        Return
    EndIf
    If !NearSmith()
        Debug.Notification("NPC Workshop: stand near Brann, out of combat.")
        Return
    EndIf
    MenuGeneration += 1
    UnregisterForModEvent("NWConversationClose_" + MenuToken)
    MenuToken = Session + "_menu_" + MenuGeneration
    RegisterForModEvent("NWConversationClose_" + MenuToken, "OnConversationClose")
    MenuRequested = True
    MenuReady = False
    NativeTransport = True
    Enabled = !RecoveryRequired
    UnregisterForUpdate()
    UI.OpenCustomMenu("NPCWorkshop/Conversation")
    Int openingGeneration = MenuGeneration
    Utility.WaitMenuMode(3.0)
    If MenuRequested && MenuGeneration == openingGeneration && !UI.IsMenuOpen("CustomMenu")
        CloseConversationMenu(openingGeneration)
        Debug.Notification("NPC Workshop: custom menu did not open. Check the SWF installation.")
    EndIf
EndFunction

Event OnMenuOpen(String menuName)
    If menuName != "CustomMenu" || !MenuRequested || MenuDriver
        Return
    EndIf
    MenuDriver = True
    String driverSession = Session
    Int driverGeneration = MenuGeneration
    Int attempts = 0
    ; MTASC initializes on its first frame, which may follow OnMenuOpen.
    While !UI.GetBool("CustomMenu", "_root.nwLoaded") && attempts < 30
        Utility.WaitMenuMode(0.1)
        If Session != driverSession || MenuGeneration != driverGeneration || !UI.IsMenuOpen("CustomMenu")
            Return
        EndIf
        attempts += 1
    EndWhile
    If !UI.GetBool("CustomMenu", "_root.nwLoaded")
        CloseConversationMenu(driverGeneration)
        Debug.Notification("NPC Workshop: conversation SWF did not initialize.")
        Return
    EndIf
    String[] args = new String[3]
    args[0] = MenuToken
    args[1] = MenuGeneration as String
    args[2] = Draft
    UI.InvokeStringA("CustomMenu", "_root.nwInitialize", args)
    PublishConversation()
    If PendingCommand != ""
        PublishPending()
    EndIf
    If RecoveryRequired
        PublishStatus("Recovery required. Close and reload a known save.", "", True)
    EndIf
    ; Menu-mode scheduling was user-verified in the feasibility spike.
    Debug.Trace("[NWConversation] driver start " + MenuToken)
    While MenuDriver && Session == driverSession && MenuGeneration == driverGeneration
        Utility.WaitMenuMode(0.25)
        If Session != driverSession || MenuGeneration != driverGeneration
            Return
        EndIf
        If !OwnsConversationMenu() || !NearSmith()
            CloseConversationMenu(driverGeneration)
            Return
        EndIf
        If Enabled && !Waiting
            SendPoll()
            Utility.WaitMenuMode(1.75)
        EndIf
    EndWhile
EndEvent

Event OnMenuClose(String menuName)
    If menuName == "CustomMenu" && MenuRequested && !UI.IsMenuOpen("CustomMenu")
        CloseConversationMenu()
    EndIf
EndEvent

Event OnConversationSend(String eventName, String token, Float generation, Form sender)
    If token != MenuToken || generation != MenuGeneration || !OwnsConversationMenu()
        Return
    EndIf
    If !CanSubmitConversation()
        PublishPending()
        PublishConversation()
        Return
    EndIf
    String text = UI.GetString("CustomMenu", "_root.nwSubmitted")
    If StringUtil.GetLength(text) < 1 || StringUtil.GetLength(text) > 500
        PublishPending()
        PublishStatus("Enter 1-500 characters.", "", False)
        Return
    EndIf
    Draft = text
    QueuedText = text
    QueuedKind = "say"
    QueueConversationCommand()
EndEvent

Bool Function CanSubmitConversation()
    Return Enabled && !RecoveryRequired && NativeConnected && MenuReady && !ServerBusy && PendingCommand == "" && NearSmith()
EndFunction

Event OnConversationAccept(String eventName, String token, Float generation, Form sender)
    If token != MenuToken || generation != MenuGeneration || !OwnsConversationMenu()
        Return
    EndIf
    If !CanSubmitConversation()
        PublishPending()
        PublishConversation()
        Return
    EndIf
    String contract = UI.GetString("CustomMenu", "_root.nwAcceptContract")
    Int revision = UI.GetInt("CustomMenu", "_root.nwAcceptRevision")
    Int i = 0
    While i < OfferCount
        If OfferContracts[i] == contract && OfferRevisions[i] == revision
            If Game.GetPlayer().GetItemCount(Gold) < OfferTotals[i]
                PublishPending()
                ConversationStatus = "Not enough player gold for this offer."
                PublishConversation()
                Return
            EndIf
            ; Accept only the displayed contract/revision, never the first/current offer implicitly.
            ; Adapter checks it again before mutation if a browser command has changed terms.
            Draft = UI.GetString("CustomMenu", "_root.nwText")
            QueuedText = ""
            QueuedKind = "accept"
            QueuedContract = contract
            QueuedRevision = revision
            QueueConversationCommand()
            Return
        EndIf
        i += 1
    EndWhile
    PublishPending()
    ConversationStatus = "Offer changed or withdrawn. Review the current terms before accepting."
    PublishConversation()
EndEvent

Function QueueConversationCommand()
    ; Shared admission for say/accept. Reserve before publishing any latent UI calls.
    CommandSerial += 1
    PendingCommand = Session + "_cmd_" + CommandSerial
    CommandQueued = True
    ConversationStatus = "Sending..."
    PublishPending()
    PublishConversation()
EndFunction

Event OnConversationClose(String eventName, String draftText, Float generation, Form sender)
    ; The event name binds the draft to a session/token without parsing player text.
    ; Native close may arrive before this callback, so accept the just-retired instance too.
    If eventName == "NWConversationClose_" + MenuToken
        If generation == MenuGeneration && MenuRequested
            Draft = draftText
            CloseConversationMenu()
        ElseIf generation == MenuGeneration - 1 && !MenuRequested
            Draft = draftText
        EndIf
    EndIf
EndEvent

Function CloseConversationMenu(Int expectedGeneration = -1)
    If !MenuRequested || (expectedGeneration != -1 && expectedGeneration != MenuGeneration)
        Return
    EndIf
    If OwnsConversationMenu()
        Draft = UI.GetString("CustomMenu", "_root.nwText")
        UI.Invoke("CustomMenu", "_root.nwShutdown")
        UI.CloseCustomMenu()
    EndIf
    MenuRequested = False
    MenuDriver = False
    MenuReady = False
    MenuGeneration += 1
    Debug.Trace("[NWConversation] driver retired " + MenuToken)
    ; A submitted request/trade is not cancelled by menu closure.
    If Enabled && !Waiting
        RegisterForSingleUpdate(0.1)
    EndIf
EndFunction

Function PublishStatus(String status, String echo, Bool busy)
    ConversationStatus = status
    PublishConversation()
EndFunction

Function PublishPending()
    If !OwnsConversationMenu()
        Return
    EndIf
    String[] args = new String[4]
    args[0] = MenuToken
    args[1] = PendingCommand
    args[2] = QueuedText
    args[3] = QueuedKind
    UI.InvokeStringA("CustomMenu", "_root.nwPending", args)
EndFunction

Function PublishConversation()
    If !OwnsConversationMenu()
        Return
    EndIf
    String[] uiArgs = new String[7]
    uiArgs[0] = MenuToken
    uiArgs[1] = ConversationStatus
    uiArgs[2] = (RecoveryRequired || !NativeConnected || !MenuReady || ServerBusy || PendingCommand != "") as String
    uiArgs[3] = PlayerGold as String
    uiArgs[4] = SupportCode
    uiArgs[5] = PendingCommand
    uiArgs[6] = ConversationState
    If LastCommandId != ""
        String[] receipt = new String[3]
        receipt[0] = MenuToken
        receipt[1] = LastCommandId
        receipt[2] = LastCommandOutcome
        UI.InvokeStringA("CustomMenu", "_root.nwCommand", receipt)
    EndIf
    UI.InvokeStringA("CustomMenu", "_root.nwReceive", uiArgs)
    String[] transcript = new String[3]
    transcript[0] = MenuToken
    transcript[1] = History
    transcript[2] = SnapshotRevision as String
    UI.InvokeStringA("CustomMenu", "_root.nwHistory", transcript)
    PublishOffers()
EndFunction

Function PublishOffers()
    If !OwnsConversationMenu()
        Return
    EndIf
    String[] envelope = new String[2]
    envelope[0] = MenuToken
    envelope[1] = SnapshotRevision as String
    UI.InvokeStringA("CustomMenu", "_root.nwOffersBegin", envelope)
    Int i = 0
    String[] offer = new String[7]
    offer[0] = MenuToken
    While i < OfferCount
        offer[1] = OfferContracts[i]
        offer[2] = OfferRevisions[i] as String
        offer[3] = OfferItems[i]
        offer[4] = OfferQuantities[i] as String
        offer[5] = OfferUnits[i] as String
        offer[6] = OfferTotals[i] as String
        UI.InvokeStringA("CustomMenu", "_root.nwOffer", offer)
        i += 1
    EndWhile
    UI.InvokeStringA("CustomMenu", "_root.nwOffersEnd", envelope)
EndFunction

Function ReadConversation(Int h)
    If RequestGeneration == 0
        Return
    EndIf
    If SKSE_HTTP.getInt(h, "version") != 2 || SKSE_HTTP.getInt(h, "generation") != RequestGeneration
        RecoveryRequired = True
        Enabled = False
        ConversationStatus = "Conversation protocol mismatch. Restart the updated bridge and reload a known save."
        SupportCode = "NW_PROTOCOL"
        If RequestGeneration == MenuGeneration
            PublishConversation()
        EndIf
        Return
    EndIf
    Int view = SKSE_HTTP.getNestedDictionary(h, "ui")
    String status = SKSE_HTTP.getString(view, "status")
    If view == 0 || status == ""
        RecoveryRequired = True
        Enabled = False
        ConversationStatus = "Invalid conversation snapshot. Reload after checking the bridge."
        SupportCode = "NW_PROTOCOL"
        If RequestGeneration == MenuGeneration
            PublishConversation()
        EndIf
        Return
    EndIf
    NativeConnected = status != "connecting" && status != "recovery_required"
    ConversationState = status
    ServerBusy = SKSE_HTTP.getBool(view, "busy")
    PlayerGold = SKSE_HTTP.getInt(view, "gold")
    ConversationStatus = SKSE_HTTP.getString(view, "status_text")
    SupportCode = SKSE_HTTP.getString(view, "support_code")
    Int revision = SKSE_HTTP.getInt(view, "revision")
    If revision < SnapshotRevision && !SKSE_HTTP.getBool(h, "reset")
        RecoveryRequired = True
        Enabled = False
        ConversationStatus = "Conversation service restarted. Reload a known save to reconnect."
        SupportCode = "NW_RESTART"
        If RequestGeneration == MenuGeneration
            PublishConversation()
        EndIf
        Return
    EndIf
    If revision > SnapshotRevision
        Int[] messages = SKSE_HTTP.getNestedDictionariesArray(view, "messages")
        String rendered = ""
        Int i = 0
        While i < messages.Length && i < 32
            String role = SKSE_HTTP.getString(messages[i], "role")
            String text = SKSE_HTTP.getString(messages[i], "text")
            If role == "player"
                rendered += "You: "
            ElseIf role == "brann"
                rendered += "Brann: "
            EndIf
            rendered += text + "\n\n"
            i += 1
        EndWhile
        History = rendered
        Int[] offers = SKSE_HTTP.getNestedDictionariesArray(view, "offers")
        OfferCount = 0
        While OfferCount < offers.Length && OfferCount < 8
            Int offer = offers[OfferCount]
            OfferContracts[OfferCount] = SKSE_HTTP.getString(offer, "contract")
            OfferRevisions[OfferCount] = SKSE_HTTP.getInt(offer, "revision")
            OfferItems[OfferCount] = SKSE_HTTP.getString(offer, "item")
            OfferQuantities[OfferCount] = SKSE_HTTP.getInt(offer, "quantity")
            ; SKSE_HTTP stores whole JSON numbers as Int, fractional numbers as Float.
            If SKSE_HTTP.valueType(offer, "unit_price") == 2
                OfferUnits[OfferCount] = SKSE_HTTP.getInt(offer, "unit_price") as Float
            Else
                OfferUnits[OfferCount] = SKSE_HTTP.getFloat(offer, "unit_price")
            EndIf
            OfferTotals[OfferCount] = SKSE_HTTP.getInt(offer, "total_price")
            OfferCount += 1
        EndWhile
        SnapshotRevision = revision
    EndIf
    Int receipt = SKSE_HTTP.getNestedDictionary(view, "command")
    String id = SKSE_HTTP.getString(receipt, "id")
    String outcome = SKSE_HTTP.getString(receipt, "state")
    If PendingCommand != "" && id == PendingCommand && (outcome == "completed" || outcome == "rejected" || outcome == "uncertain")
        LastCommandId = PendingCommand
        LastCommandOutcome = outcome
        If outcome == "completed" && QueuedKind == "say"
            Draft = ""
        ElseIf outcome == "rejected"
            If QueuedKind == "accept"
                ConversationStatus = "Offer not accepted (" + SKSE_HTTP.getString(receipt, "code") + "). Review current terms."
            Else
                ConversationStatus = "Message not sent (" + SKSE_HTTP.getString(receipt, "code") + "). Your draft is preserved."
            EndIf
        EndIf
        If RequestGeneration == MenuGeneration && OwnsConversationMenu()
            String[] args = new String[3]
            args[0] = MenuToken
            args[1] = PendingCommand
            args[2] = outcome
            UI.InvokeStringA("CustomMenu", "_root.nwCommand", args)
        EndIf
        PendingCommand = ""
        QueuedText = ""
        QueuedKind = ""
        QueuedContract = ""
        QueuedRevision = 0
        CommandQueued = False
    EndIf
    If RequestGeneration == MenuGeneration
        MenuReady = True
        PublishConversation()
    EndIf
EndFunction
