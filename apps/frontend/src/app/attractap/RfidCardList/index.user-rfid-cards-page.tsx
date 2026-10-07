import { useParams } from 'react-router-dom';
import { NotFound } from '../../not-found';
import { RfidCardList } from './index.rfid-card-list';

export function UserRfidCardsPage() {
  const { id } = useParams<{ id: string }>();
  if (!/^\d+$/.test(id ?? '') || Number(id) <= 0) return <NotFound />;
  return <RfidCardList key={id} userId={Number(id)} />;
}
