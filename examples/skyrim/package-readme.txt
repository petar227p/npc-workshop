NPC Workshop - Brann in Skyrim (local test package)

Target: Skyrim 1.7.104.0 / SKSE 2.3.1. Gameplay regression is pending.
This is a local build containing face assets from your Skyrim installation.
Do not publish or redistribute Bethesda assets from this package.

Quit Skyrim before installation. Back up your previous mod package and use a
disposable save. Install the entire ZIP through your mod manager, or extract
it into Data. Keep NPCWorkshopSkyrim.esp enabled. Do not spawn another Brann.

Start the existing API and v2 local bridge (npm run skyrim), launch with SKSE,
load your test save, and activate Brann near Warmaidens using your configured
Activate control. The panel connects automatically. F9/F8 are diagnostics.
Type messages; review the exact offer and click Confirm purchase to accept.
Trade complete requires actual inventory transfer and its acknowledgement.
Inventory shows Brann's actual carried items, quantities, base weights/values
and gold. Use Previous/Next for all pages and Refresh to read Skyrim again.
This view is read only; Esc/Back returns to chat with your draft preserved.
Enchanted/improved copies share a base-item row; values are not trade prices.
The model receives current carried-inventory facts before each reply, up to
128 base forms (larger inventories are explicitly marked partial). Restart
both API and bridge with the updated repository, then reload a test save.
Eligible carried items can now be negotiated and bought through checked offers.
Equipped gear, gold, non-playable forms and VendorNoSale items are excluded.
The item moves before gold is charged; exact counts must be acknowledged.
New goods use their base gold value as a minimum price (at least 1 gold).
Daggers retain their 10-gold floor. Enchantments/improvements are not priced.
Esc closes the panel and releases input. A submitted action is not cancelled
by closure. Unknown outcomes require recovery; never blindly retry a trade.

Save loading starts a fresh conversation. After restarting the bridge, reload
a known save. Keep local service credentials in the repository's environment
configuration; no API credentials are included in this package.

NPCWorkshop-manifest.json lists every payload file's SHA-256 and size, the
build-input hashes and target runtime. Source/UI and Source/Scripts contain
editable source snapshots. Build from the repository using build-mod.ps1;
the source snapshots alone are not a standalone SDK. Verify an archive with:
  python examples/skyrim/package_mod.py --verify <package.zip>

Packaging is byte-for-byte reproducible for identical compiled inputs. The
Creation Kit compiler can reorder PEX symbol tables between source builds;
fresh source compilations are not promised to have identical binary hashes.
Build/source timestamps and user/computer header metadata are normalized;
bytecode and debug line tables are retained. Raw compiler output remains in
dist/build-* for comparison or exact repackaging.

See examples/skyrim/ui/release-test.md in the repository for the gameplay
record, rollback instructions, reproducible build commands and limitations.
