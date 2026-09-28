/**
 * The title of the screen you are on — on a desktop, where the phone's top bar
 * is hidden.
 *
 * Hiding that bar took the page's name and its back arrow with it, so a wide
 * window opened "New Kundli" as an unlabelled form, and a chart sub-screen had
 * nothing saying which chart or how to get out of it. This puts the name back
 * at the top of the content column, where a desktop app keeps it — big enough
 * to be the page's heading rather than a chrome label.
 *
 * Root destinations (the ones in the rail) don't get one: the rail already
 * says where you are, and a heading repeating it is furniture.
 */
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ChevronLeft } from 'lucide-react';
import { titleFor, localTitle, isRootTab, parentOf } from '@/components/mobile/routes';

export default function PageHeader() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  if (isRootTab(pathname) || pathname === '/login') return null;

  const title = localTitle(titleFor(pathname));

  const back = () => {
    // A reload throws the history away, so "back" has to have somewhere to go
    // on its own: the screen this one sits under.
    if (window.history.length > 1) navigate(-1);
    else navigate(parentOf(pathname));
  };

  return (
    <motion.div
      className="page-header mb-5 flex items-center gap-3"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
    >
      <button
        type="button"
        onClick={back}
        aria-label="Back"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ChevronLeft className="h-[18px] w-[18px]" />
      </button>
      <h1 className="truncate text-[24px] font-bold leading-tight tracking-tight">{title}</h1>
    </motion.div>
  );
}
