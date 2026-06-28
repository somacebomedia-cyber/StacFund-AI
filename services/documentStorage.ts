import { collection, doc, writeBatch, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from './firebase';

const CHUNK_SIZE = 500 * 1024; // 500KB chunks

export async function saveDocumentContent(userId: string, docId: string, base64: string) {
  const chunksRef = collection(db, 'users', userId, 'documents', docId, 'chunks');
  
  // Create chunks
  let chunkIndex = 0;
  let offset = 0;
  
  // Use a batch to ensure atomicity, but batch has a limit of 500 writes.
  // 5MB / 500KB = ~14 chunks, well within 500.
  const batch = writeBatch(db);
  
  while (offset < base64.length) {
    const chunkData = base64.slice(offset, offset + CHUNK_SIZE);
    const chunkDocRef = doc(chunksRef, chunkIndex.toString().padStart(5, '0'));
    batch.set(chunkDocRef, { data: chunkData, index: chunkIndex });
    
    offset += CHUNK_SIZE;
    chunkIndex++;
  }
  
  await batch.commit();
}

export async function getDocumentContent(userId: string, docId: string): Promise<string | null> {
  const chunksRef = collection(db, 'users', userId, 'documents', docId, 'chunks');
  const q = query(chunksRef, orderBy('index', 'asc'));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) return null;
  
  let base64 = '';
  snapshot.forEach(chunkDoc => {
    base64 += chunkDoc.data().data;
  });
  
  return base64;
}

export async function deleteDocumentContent(userId: string, docId: string) {
  const chunksRef = collection(db, 'users', userId, 'documents', docId, 'chunks');
  const snapshot = await getDocs(chunksRef);
  
  if (snapshot.empty) return;

  const batch = writeBatch(db);
  snapshot.forEach(chunkDoc => {
    batch.delete(chunkDoc.ref);
  });
  
  await batch.commit();
}
