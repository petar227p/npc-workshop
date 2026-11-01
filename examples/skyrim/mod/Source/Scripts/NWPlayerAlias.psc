Scriptname NWPlayerAlias extends ReferenceAlias

Event OnPlayerLoadGame()
    (GetOwningQuest() as NWBridgeQuest).BeginSession()
EndEvent
