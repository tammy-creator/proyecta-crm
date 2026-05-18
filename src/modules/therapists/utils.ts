import { type Therapist } from './types';

export const getIllustrativeAvatar = (t: Partial<Therapist>) => {
    if (t.avatarUrl) {
        if (t.avatarUrl.startsWith('http')) return t.avatarUrl;
        return `${import.meta.env.VITE_AVATARS_SERVER_URL}${t.avatarUrl}`;
    }
    // Usamos la versión 7.x que es más estable y forzamos sonrisa simple
    const seed = encodeURIComponent(t.fullName || 'default');
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}&mouth=smile&eyebrows=default`;
};
