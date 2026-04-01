import './style.css';
import { mountMidiLab } from './ui/app';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Missing #app root element.');
}

mountMidiLab(root);
