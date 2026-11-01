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

Event OnInit()
    BeginSession()
EndEvent

Function BeginSession()
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
    RegisterForKey(66) ; F8, DirectInput scan code
    RegisterForModEvent("SKSE_HTTP_OnHttpReplyReceived", "OnReply")
    RegisterForModEvent("SKSE_HTTP_OnHttpErrorReceived", "OnHttpError")
    Debug.Notification("NPC Workshop: near Brann, press F8 to connect text chat.")
EndFunction

Event OnKeyDown(Int keyCode)
    If keyCode == 66 && !Utility.IsInMenuMode()
        If !Enabled
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
    If !Enabled || Waiting
        Return
    EndIf
    If Brann == None || Gold == None || Dagger == None
        Debug.MessageBox("NPC Workshop: missing quest properties/forms. Check mod setup.")
        Enabled = False
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
    Waiting = True
    SKSE_HTTP.sendLocalhostHttpRequest(h, 8788, "skyrim/poll", 5000)
    ; No timed mutation retry: an ambiguous network failure requires a save reload.
EndEvent

Bool Function CountsMatch(Int h, String prefix)
    Actor p = Game.GetPlayer()
    Return p.GetItemCount(Gold) == SKSE_HTTP.getInt(h, prefix + "pgold", -1) && Brann.GetItemCount(Gold) == SKSE_HTTP.getInt(h, prefix + "sgold", -1) && p.GetItemCount(Dagger) == SKSE_HTTP.getInt(h, prefix + "pitem", -1) && Brann.GetItemCount(Dagger) == SKSE_HTTP.getInt(h, prefix + "sitem", -1)
EndFunction

Event OnReply(Int h)
    If SKSE_HTTP.getString(h, "bridge") != "npc-workshop" || SKSE_HTTP.getString(h, "session") != Session || SKSE_HTTP.getInt(h, "request") != Request || !Waiting
        Return
    EndIf
    Waiting = False
    If SKSE_HTTP.getBool(h, "reset")
        Enabled = False
        Debug.MessageBox(SKSE_HTTP.getString(h, "message") + " Reload a known save to reconnect.")
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
                    Debug.Notification("NPC Workshop: trade delivered.")
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
        If line != ""
            Debug.Notification(line)
        EndIf
    EndIf
    RegisterForSingleUpdate(2.0)
EndEvent

Event OnHttpError(Int h)
    If Waiting
        Waiting = False
        Enabled = False
        Debug.MessageBox("NPC Workshop: HTTP failed. Check local servers and reload a known save. An action may already have committed.")
    EndIf
EndEvent
