using Mutagen.Bethesda.Skyrim;
using Mutagen.Bethesda.Plugins;
using Mutagen.Bethesda;
using Noggog;
using Mutagen.Bethesda.Archives;

if (args.FirstOrDefault() == "--build")
{
    if (args.Length != 3) throw new ArgumentException("--build <Skyrim.esm> <output directory>");
    using var source = SkyrimMod.CreateFromBinaryOverlay(args[1], SkyrimRelease.SkyrimSE);
    var output = Path.GetFullPath(args[2]);
    Directory.CreateDirectory(output);
    var mod = new SkyrimMod(ModKey.FromFileName("NPCWorkshopSkyrim.esp"), SkyrimRelease.SkyrimSE);
    foreach (var expected in new uint[] { 0x800, 0x801, 0x802 })
        if (mod.GetNextFormKey().ID != expected) throw new Exception("Unexpected form allocation");
    FormKey key(uint id) => new(mod.ModKey, id);
    var template = source.Npcs.Single(n => n.EditorID == "Ulfberth");
    var npc = template.Duplicate(key(0x800));
    npc.EditorID = "NWBrann"; npc.Name = "Brann"; npc.ShortName = "Brann";
    npc.VirtualMachineAdapter = null;
    npc.Template.Clear(); npc.Configuration.TemplateFlags = 0;
    npc.Configuration.Flags &= ~(NpcConfiguration.Flag.Respawn | NpcConfiguration.Flag.UseTemplate | NpcConfiguration.Flag.Protected);
    npc.Configuration.Flags |= NpcConfiguration.Flag.Essential | NpcConfiguration.Flag.Unique;
    npc.Factions.Clear(); npc.Packages.Clear(); npc.Items ??= new(); npc.Items.Clear();
    npc.CrimeFaction.Clear(); npc.DeathItem.Clear(); npc.DefaultPackageList.Clear();
    npc.SpectatorOverridePackageList.Clear(); npc.ObserveDeadBodyOverridePackageList.Clear();
    npc.GuardWarnOverridePackageList.Clear(); npc.CombatOverridePackageList.Clear();
    npc.AIData ??= new AIData(); npc.AIData.Aggression = Aggression.Unaggressive;
    foreach (var (id, count) in new[] { (0x1397eu, 6), (0xfu, 50) })
    {
        var entry = new ContainerEntry { Item = new ContainerItem { Count = count } };
        entry.Item.Item.SetTo(new FormKey(source.ModKey, id)); npc.Items.Add(entry);
    }
    mod.Npcs.Add(npc);

    var sourceWorld = source.Worldspaces.Single(w => w.EditorID == "WhiterunWorld");
    var sourceCells = sourceWorld.SubCells.SelectMany(b => b.Items).SelectMany(b => b.Items).Cast<ICellGetter>().Prepend(sourceWorld.TopCell!);
    var forge = sourceCells.SelectMany(c => c.Persistent.Concat(c.Temporary)).OfType<IPlacedObjectGetter>()
        .Single(p => p.FormKey == new FormKey(source.ModKey, 0x0c430a));
    var world = sourceWorld.DeepCopy();
    world.SubCells.Clear(); world.LargeReferences.Clear();
    var cell = world.TopCell ?? throw new Exception("Whiterun persistent cell absent");
    cell.Persistent.Clear(); cell.Temporary.Clear(); cell.NavigationMeshes.Clear(); cell.Landscape = null;
    var position = forge.Placement!.Position;
    var placed = new PlacedNpc(key(0x801), SkyrimRelease.SkyrimSE) {
        EditorID = "NWBrannRef", MajorFlags = PlacedNpc.MajorFlag.Persistent,
        Placement = new Placement { Position = new P3Float(position.X + 200, position.Y, position.Z + 10), Rotation = forge.Placement.Rotation },
    };
    placed.Base.SetTo(npc.FormKey); cell.Persistent.Add(placed); mod.Worldspaces.Add(world);

    // Put activation behavior on this one placed reference, not the actor base.
    placed.VirtualMachineAdapter = new VirtualMachineAdapter { Version = 5, ObjectFormat = 2 };
    var activationScript = new ScriptEntry { Name = "NWBrannActor" };
    var bridgeProperty = new ScriptObjectProperty { Name = "Bridge", Flags = ScriptProperty.Flag.Edited, Alias = -1 };
    bridgeProperty.Object.SetTo(key(0x802)); activationScript.Properties.Add(bridgeProperty);
    placed.VirtualMachineAdapter.Scripts.Add(activationScript);

    var quest = new Quest(key(0x802), SkyrimRelease.SkyrimSE) {
        EditorID = "NWIntegrationQuest", Name = "NPC Workshop: Brann", Priority = 10,
        Flags = Quest.Flag.StartGameEnabled, NextAliasID = 1,
        VirtualMachineAdapter = new QuestAdapter { Version = 5, ObjectFormat = 2, ExtraBindDataVersion = 2 },
    };
    var script = new ScriptEntry { Name = "NWBridgeQuest" };
    var property = new ScriptObjectProperty { Name = "Brann", Flags = ScriptProperty.Flag.Edited, Alias = -1 };
    property.Object.SetTo(placed.FormKey); script.Properties.Add(property);
    quest.VirtualMachineAdapter.Scripts.Add(script);
    var alias = new QuestAlias { ID = 0, Name = "Player", Type = QuestAlias.TypeEnum.Reference,
        Flags = QuestAlias.Flag.AllowReuseInQuest };
    alias.ForcedReference.SetTo(new FormKey(source.ModKey, 0x14)); quest.Aliases.Add(alias);
    var aliasScript = new QuestFragmentAlias { Version = 5, ObjectFormat = 2,
        Property = new ScriptObjectProperty { Alias = 0 } };
    aliasScript.Property.Object.SetTo(quest.FormKey);
    aliasScript.Scripts.Add(new ScriptEntry { Name = "NWPlayerAlias" });
    quest.VirtualMachineAdapter.Aliases.Add(aliasScript);
    mod.Quests.Add(quest);
    var path = Path.Combine(output, mod.ModKey.FileName);
    mod.WriteToBinary(path);

    // Reuse this installation's matching face assets; never commit/distribute Bethesda assets in source control.
    var assets = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) {
        ["meshes/actors/character/facegendata/facegeom/skyrim.esm/00013b9f.nif"] = "meshes/actors/character/facegendata/facegeom/NPCWorkshopSkyrim.esp/00000800.nif",
        ["textures/actors/character/facegendata/facetint/skyrim.esm/00013b9f.dds"] = "textures/actors/character/facegendata/facetint/NPCWorkshopSkyrim.esp/00000800.dds",
    };
    foreach (var archivePath in Directory.EnumerateFiles(Path.GetDirectoryName(Path.GetFullPath(args[1]))!, "Skyrim - *.bsa"))
    {
        var archive = Archive.CreateReader(GameRelease.SkyrimSE, archivePath);
        foreach (var file in archive.Files)
        {
            var relative = file.Path.Replace('\\', '/');
            if (!assets.TryGetValue(relative, out var destination)) continue;
            var target = Path.Combine(output, destination); Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            File.WriteAllBytes(target, file.GetBytes()); assets.Remove(relative);
            Console.WriteLine($"Face asset: {destination}");
        }
        if (archive is IDisposable disposable) disposable.Dispose();
        if (assets.Count == 0) break;
    }
    if (assets.Count != 0) throw new Exception("Matching vanilla face assets not found");

    // Parse the emitted bytes rather than only validating the in-memory construction.
    using var check = SkyrimMod.CreateFromBinaryOverlay(path, SkyrimRelease.SkyrimSE);
    if (check.Npcs.Count != 1 || check.Quests.Count != 1 || check.Worldspaces.Count != 1 || check.EnumerateMajorRecords().Count() != 5)
        throw new Exception("Unexpected output record count");
    var checkedNpc = check.Npcs.Single();
    if (checkedNpc.EditorID != "NWBrann" || checkedNpc.Factions.Count != 0 || checkedNpc.Packages.Count != 0 ||
        checkedNpc.VirtualMachineAdapter != null || checkedNpc.Items!.Count != 2 ||
        checkedNpc.Items.Single(i => i.Item.Item.FormKey.ID == 0xf).Item.Count != 50 ||
        checkedNpc.Items.Single(i => i.Item.Item.FormKey.ID == 0x1397e).Item.Count != 6 ||
        check.ModHeader.MasterReferences.Count != 1 || check.ModHeader.MasterReferences[0].Master != source.ModKey)
        throw new Exception("Actor inventory/isolation/master check failed");
    var checkedQuest = check.Quests.Single();
    var checkedReference = check.Worldspaces.Single().TopCell!.Persistent.OfType<IPlacedNpcGetter>().Single();
    var checkedQuestScript = checkedQuest.VirtualMachineAdapter!.Scripts.Single();
    var checkedBrannProperty = checkedQuestScript.Properties.OfType<IScriptObjectPropertyGetter>().Single();
    if (checkedNpc.FormKey != key(0x800) || checkedReference.FormKey != key(0x801) || checkedQuest.FormKey != key(0x802) ||
        checkedReference.Base.FormKey != checkedNpc.FormKey || checkedReference.EditorID != "NWBrannRef" ||
        !checkedReference.MajorFlags.HasFlag(PlacedNpc.MajorFlag.Persistent) ||
        checkedQuestScript.Name != "NWBridgeQuest" || checkedBrannProperty.Name != "Brann" ||
        checkedBrannProperty.Alias != -1 || checkedBrannProperty.Object.FormKey != checkedReference.FormKey ||
        checkedQuest.VirtualMachineAdapter.Aliases.Single().Scripts.Single().Name != "NWPlayerAlias" ||
        checkedQuest.Aliases.Single().ForcedReference.FormKey.ID != 0x14 ||
        check.Worldspaces.Single().TopCell!.Persistent.Single().FormKey != placed.FormKey)
        throw new Exception("Quest/property/alias/reference round-trip failed");
    var checkedActivation = checkedReference.VirtualMachineAdapter ?? throw new Exception("Missing reference activation VMAD");
    var checkedActivationScript = checkedActivation.Scripts.Single();
    var checkedBridgeProperty = checkedActivationScript.Properties.OfType<IScriptObjectPropertyGetter>().Single();
    if (checkedActivation.Version != 5 || checkedActivation.ObjectFormat != 2 ||
        checkedActivationScript.Name != "NWBrannActor" || checkedActivationScript.Properties.Count != 1 ||
        checkedBridgeProperty.Name != "Bridge" || checkedBridgeProperty.Alias != -1 ||
        checkedBridgeProperty.Flags != ScriptProperty.Flag.Edited || checkedBridgeProperty.Object.FormKey != checkedQuest.FormKey ||
        check.Worldspaces.Single().TopCell!.Temporary.Count != 0)
        throw new Exception("Brann-only activation script/property round-trip failed");
    Console.WriteLine($"Built and reparsed {path}");
    Console.WriteLine($"NPC {npc.FormKey}; reference {placed.FormKey}; quest {quest.FormKey}; position {placed.Placement.Position}");
    Console.WriteLine("5 records: new NPC/reference/quest plus Whiterun world/persistent-cell overrides. In-game verification still required.");
    Console.WriteLine("Activation verified: NWBrannRef -> NWBrannActor.Bridge -> NWIntegrationQuest -> NWBridgeQuest.Brann -> NWBrannRef; NPC base has no scripts.");
    return;
}

if (args.Length == 0)
{
    Console.WriteLine("Usage: --build <Skyrim.esm> <output directory>; --scan <Skyrim.esm>; or record type names for schema inspection.");
    return;
}

if (args.FirstOrDefault() == "--scan")
{
    using var skyrim = SkyrimMod.CreateFromBinaryOverlay(args[1], SkyrimRelease.SkyrimSE);
    foreach (var npc in skyrim.Npcs.Where(n => (n.EditorID ?? "").Contains("Ulfberth", StringComparison.OrdinalIgnoreCase) || (n.EditorID ?? "").Contains("Adrianne", StringComparison.OrdinalIgnoreCase)))
        Console.WriteLine($"NPC {npc.EditorID} {npc.FormKey}");
    var world = skyrim.Worldspaces.Single(w => w.EditorID == "WhiterunWorld");
    Console.WriteLine($"World: {world.FormKey} topcell {world.TopCell?.FormKey}");
    foreach (var placed in world.TopCell!.Persistent.OfType<IPlacedNpcGetter>())
        Console.WriteLine($"REF {placed.EditorID} {placed.FormKey} base {placed.Base.FormKey} position {placed.Placement?.Position}");
    var adrianne = skyrim.Npcs.Single(n => n.EditorID == "AdrianneAvenicci").FormKey;
    foreach (var placed in skyrim.EnumerateMajorRecords().OfType<IPlacedNpcGetter>().Where(p => p.Base.FormKey == adrianne))
        Console.WriteLine($"ANCHOR {placed.EditorID} {placed.FormKey} position {placed.Placement?.Position} rotation {placed.Placement?.Rotation}");
    var smithing = skyrim.Furniture.Where(f => (f.EditorID ?? "").Contains("Forge", StringComparison.OrdinalIgnoreCase)).Select(f => f.FormKey).ToHashSet();
    var cells = world.SubCells.SelectMany(b => b.Items).SelectMany(b => b.Items).Cast<ICellGetter>().Prepend(world.TopCell!);
    foreach (var cell in cells)
    foreach (var p in cell.Persistent.Concat(cell.Temporary).OfType<IPlacedObjectGetter>().Where(p => smithing.Contains(p.Base.FormKey) || (p.EditorID ?? "").Contains("Warmaiden", StringComparison.OrdinalIgnoreCase)))
        Console.WriteLine($"EXTERIOR {p.EditorID} {p.FormKey} base {p.Base.FormKey} cell {cell.EditorID} position {p.Placement?.Position} rotation {p.Placement?.Rotation}");
    return;
}

foreach (var name in args)
{
    var type = typeof(Quest).Assembly.GetType("Mutagen.Bethesda.Skyrim." + name);
    if (type == null) { Console.WriteLine("Missing: " + name); continue; }
    Console.WriteLine(type.FullName);
    foreach (var p in type.GetProperties()) Console.WriteLine($"  {p.Name}: {p.PropertyType}");
    foreach (var nested in type.GetNestedTypes()) if (nested.IsEnum) Console.WriteLine($"  {nested.Name}: {string.Join(", ", Enum.GetNames(nested))}");
}
