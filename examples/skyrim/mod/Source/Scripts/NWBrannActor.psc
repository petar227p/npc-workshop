Scriptname NWBrannActor extends Actor

NWBridgeQuest Property Bridge Auto

; Attached only to NWBrannRef, never to a vanilla actor or a shared NPC base.
Function PrepareActivation(NWBridgeQuest controller)
    If controller == None || controller.Brann != Self
        Return
    EndIf
    Bridge = controller
    ; Block only default dialogue. The engine still sends OnActivate using the
    ; player's configured Activate control; no key registration is necessary.
    BlockActivation(True)
EndFunction

Event OnInit()
    PrepareActivation(Bridge)
EndEvent

Event OnLoad()
    PrepareActivation(Bridge)
EndEvent

Event OnActivate(ObjectReference akActionRef)
    If akActionRef == Game.GetPlayer() && Bridge != None
        Bridge.ActivateConversation(Self, akActionRef)
    EndIf
EndEvent
