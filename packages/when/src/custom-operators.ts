import { Observable, Scheduler, timer } from 'rxjs';
import { map, switchAll } from 'rxjs/operators';

export function createCollection<T>(input: Observable<T>): Array<T> {
  const ret: Array<T> = [];
  input.subscribe((x) => ret.push(x));

  return ret;
}

export const breakOn = <T>(selector: ((x: T) => boolean)) => (source: Observable<T>) => {
  return source.lift({
    call: (sub, src) => src.subscribe((x: T) => {
      // tslint:disable-next-line:no-debugger
      if (selector(x)) debugger;
      sub.next(x);
    }, sub.error.bind(sub), sub.complete.bind(sub)),
  });
};

export const guaranteedThrottle = <T>(time: number, scheduler?: Scheduler) => (source: Observable<T>) => {
    return source.pipe(
      map((x: any) => timer(time, scheduler).pipe(map(() => x))),
      switchAll(),
    );
};
