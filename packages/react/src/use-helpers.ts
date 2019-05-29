import * as React from 'react';

import { useEffect, useState } from 'react';
import { Observable } from 'rxjs';

console.log(React);

export function useObservable<T>(target: Observable<T>, initial: T) {
  const [ret, setter] = useState(initial);

  useEffect(() => {
    console.log('effect!');
    const sub = target.subscribe(x => {
      console.log('next!');
      setter(x);
    });

    return () => {
      console.log('boy bye');
      sub.unsubscribe();
    };
  }, [target]);

  return ret;
}
