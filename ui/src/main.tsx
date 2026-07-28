import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AccessGate from './AccessGate';
import App from './App';
import { getRuntimeConfig } from './config';
import SharePage from './SharePage';
import { getShareIdFromPathname } from './share-route';
import '../styles.css';

const shareId = getShareIdFromPathname(window.location.pathname);
const runtimeConfig = getRuntimeConfig();

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        {shareId ? (
            <SharePage shareId={shareId} />
        ) : (
            <AccessGate password={runtimeConfig.libraryPassword}>
                <App />
            </AccessGate>
        )}
    </StrictMode>,
);
