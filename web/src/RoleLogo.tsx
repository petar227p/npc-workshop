import type { NpcDraft } from '@blacksmith/shared';
import type { SetupRole, Teller } from '@blacksmith/shared/src/setup';
import { editorIdentity } from './editorPresentation';

export type RoleLogoId = 'merchant' | 'craftsperson' | 'villager' | 'storyteller' | 'guard' | 'smith' | 'cottager' | 'crier' | 'farmer' | 'keeper' | 'bard';

export const ROLE_OPTIONS: { role: SetupRole; teller?: Teller; label: string; description: string; logo: RoleLogoId }[] = [
  { role: 'merchant', label: 'Merchant', description: 'Sells goods from stock and bargains with customers.', logo: 'merchant' },
  { role: 'craftsperson', label: 'Craftsperson', description: 'Takes orders and makes items from materials over time.', logo: 'craftsperson' },
  { role: 'villager', label: 'Villager', description: 'Chats in character and can share news it knows.', logo: 'villager' },
  { role: 'storyteller', teller: 'bard', label: 'Bard', description: 'Shares news with a crowd through stories and tales.', logo: 'bard' },
  { role: 'storyteller', teller: 'crier', label: 'Town crier', description: 'Announces news to everyone around at its own place.', logo: 'crier' },
  { role: 'guard', label: 'Guard', description: 'Offers gate passes and can request actions from your game.', logo: 'guard' },
];

export function roleLogoForDraft(draft: NpcDraft): RoleLogoId {
  const role = editorIdentity(draft).role;
  if (role.includes('craftsperson') || role === 'Craftsperson') return draft.id === 'smith' ? 'smith' : 'craftsperson';
  if (role === 'Merchant') return 'merchant';
  if (role === 'Guard') return 'guard';
  if (role === 'Town crier') return 'crier';
  if (role === 'Bard') return 'bard';
  // These village jobs share conversational abilities, but have their own emblems.
  if (draft.id === 'cottager' || draft.id === 'farmer' || draft.id === 'keeper') return draft.id;
  return 'villager';
}

export function RoleLogo({ role, className = '' }: { role: RoleLogoId; className?: string }) {
  return <img className={`role-logo ${className}`} src={`/brand/roles/${role}.png`} width={64} height={64} alt="" aria-hidden="true" />;
}
