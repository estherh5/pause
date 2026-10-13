// The code default is the only source of truth. NEVER set EMAIL_FROM on Vercel
// (tide's digest shipped as "Restock <invites@…>" for 20 days because of one).
export const FROM = process.env.EMAIL_FROM || 'Pause <pause@crystalprism.io>';
