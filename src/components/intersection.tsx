import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

type Callback = (intersecting: boolean) => void;
type Ctx = { observe: (el: Element, cb: Callback) => () => void };

function createObserverContext() {
  const Context = createContext<Ctx | null>(null);

  function Provider({
    root,
    options,
    children,
  }: {
    root: Element | null;
    options: Omit<IntersectionObserverInit, "root">;
    children: ReactNode;
  }) {
    const callbacks = useRef<Map<Element, Callback>>(new Map());
    const observerRef = useRef<IntersectionObserver | null>(null);

    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            callbacks.current.get(entry.target)?.(entry.isIntersecting);
          }
        },
        { ...options, root },
      );
    }

    useEffect(() => {
      const obs = observerRef.current;
      return () => obs?.disconnect();
    }, []);

    const observe = useCallback((el: Element, cb: Callback) => {
      const map = callbacks.current;
      const obs = observerRef.current!;
      map.set(el, cb);
      obs.observe(el);
      return () => {
        map.delete(el);
        obs.unobserve(el);
      };
    }, []);

    return <Context.Provider value={{ observe }}>{children}</Context.Provider>;
  }

  function useObserver(): Ctx | null {
    return useContext(Context);
  }

  return { Provider, useObserver };
}

export const LoadObserver = createObserverContext();
export const VisibilityObserver = createObserverContext();
