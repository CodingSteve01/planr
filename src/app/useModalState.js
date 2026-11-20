import { useState } from 'react';

// The open dialog, the node it was opened on and the part of it to focus.
export function useModalState() {
  const [modal, setModal] = useState(null);
  const [modalNode, setMN] = useState(null);
  const [modalFocus, setModalFocus] = useState(null);
  return { modal, setModal, modalNode, setMN, modalFocus, setModalFocus };
}
