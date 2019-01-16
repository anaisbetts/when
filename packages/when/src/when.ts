import { combineLatest, Observable } from 'rxjs';
import { distinctUntilChanged, map, startWith, switchAll } from 'rxjs/operators';

import { ChangeNotification, UntypedChangeNotification } from './model';

// tslint:disable-next-line:no-require-imports
import isObject = require('lodash.isobject');

// tslint:disable-next-line:no-require-imports
import isEqual = require('lodash.isequal');

import { chainToProps, fetchValueForPropertyChain, notificationForProperty } from './when-helpers';

export function whenPropertyInternal(
    target: any,
    valueOnly: boolean,
    ...propsAndSelector: Array<string|Function|string[]>): Observable<any> {
  if (propsAndSelector.length < 1) {
    throw new Error('Must specify at least one property!');
  }

  if (propsAndSelector.length === 1) {
    const ret = observableForPropertyChain(target, propsAndSelector[0] as string);
    return valueOnly ? ret.pipe(map(x => x.value)) : ret;
  }

  const [selector] = propsAndSelector.splice(-1, 1);
  if (!(selector instanceof Function)) {
    throw new Error('In multi-item properties, the last function must be a selector');
  }

  const propsOnly = propsAndSelector as Array<string|string[]>;
  const propWatchers = propsOnly.map((p) =>
    valueOnly ?
      observableForPropertyChain(target, p).pipe(map(x => x.value)) :
      observableForPropertyChain(target, p));

  return combineLatest(...propWatchers, selector).pipe(
    distinctUntilChanged((x, y) => isEqual(x, y)),
  );
}

export function getValue<T, TRet>(
    target: T,
    accessor: PropSelector<T, TRet>): ChangeNotification<T, TRet> | null;

export function getValue(
    target: any,
    accessor: UntypedPropSelector): UntypedChangeNotification | null {
  const propChain = chainToProps(accessor);
  return fetchValueForPropertyChain(target, propChain);
}

export function observableForPropertyChain(
    target: any,
    chain: UntypedPropSelector,
    before = false): Observable<UntypedChangeNotification> {
  const props = chainToProps(chain);

  const firstProp = props[0];
  let start = notificationForProperty(target, firstProp, before);

  if (isObject(target) && firstProp in target) {
    start = start.pipe(
      startWith({ sender: target, property: firstProp, value: target[firstProp] }));
  }

  if (props.length === 1) {
    return start.pipe(
      distinctUntilChanged((x, y) => isEqual(x.value, y.value)));
  }

  // target.foo
  return start.pipe(
    map((x) => {
      return observableForPropertyChain(x.value, props.slice(1), before).pipe(
        map((y) => {
          // This is for target.foo.bar.baz, its sender will be
          // target.foo, and its property will be bar.baz
          return { sender: target, property: `${firstProp}.${y.property}`, value: y.value };
        }));
    }),
    switchAll(),
    distinctUntilChanged((x, y) => isEqual(x.value, y.value)));
}


/*
 * Extremely boring and ugly type descriptions ahead
 */

export type UntypedPropSelector = Function | string | string[];
export type SendingPropSelector<TIn> = ((t: TIn) => any) | string | string[];
export type PropSelector<TIn, TOut> = ((t: TIn) => TOut) | string | string[];

export function when<TSource, TRet>(
    target: TSource,
    prop: PropSelector<TSource, TRet>): Observable<TRet>;

export function when<TSource, TProp1, TProp2, TRet>(
    target: TSource,
    prop1: PropSelector<TSource, TProp1>,
    prop2: PropSelector<TSource, TProp2>,
    sel: ((p1: TProp1, p2: TProp2) => TRet)):
  Observable<TRet>;

export function when<TSource, TProp1, TProp2, TProp3, TRet>(
    target: TSource,
    prop1: PropSelector<TSource, TProp1>,
    prop2: PropSelector<TSource, TProp2>,
    prop3: PropSelector<TSource, TProp3>,
    sel: ((p1: TProp1, p2: TProp2, p3: TProp3) => TRet)):
  Observable<TRet>;

export function when<TSource, TProp1, TProp2, TProp3, TProp4, TRet>(
    target: TSource,
    prop1: PropSelector<TSource, TProp1>,
    prop2: PropSelector<TSource, TProp2>,
    prop3: PropSelector<TSource, TProp3>,
    prop4: PropSelector<TSource, TProp4>,
    sel: ((p1: TProp1, p2: TProp2, p3: TProp3, p4: TProp4) => TRet)):
  Observable<TRet>;

export function when<TSource, TRet>(
    target: TSource,
    prop: string): Observable<TRet>;

export function when<TSource, TProp1, TProp2, TRet>(
    target: TSource,
    prop1: string,
    prop2: string,
    sel: ((p1: TProp1, p2: TProp2) => TRet)):
  Observable<TRet>;

export function when(target: any, ...propsAndSelector: Array<UntypedPropSelector>): Observable<any> {
  return whenPropertyInternal(target, true, ...propsAndSelector);
}

export function whenProperty<TSource, TRet>(
    target: TSource,
    prop: PropSelector<TSource, TRet>):
  Observable<ChangeNotification<TSource, TRet>>;

export function whenProperty<TSource, TProp1, TProp2, TRet>(
    target: TSource,
    prop1: PropSelector<TSource, TProp1>,
    prop2: PropSelector<TSource, TProp2>,
    sel: ((p1: ChangeNotification<TSource, TProp1>, p2: ChangeNotification<TSource, TProp2>) => TRet)):
  Observable<ChangeNotification<TSource, TRet>>;

export function whenProperty<TSource, TProp1, TProp2, TProp3, TRet>(
    target: TSource,
    prop1: PropSelector<TSource, TProp1>,
    prop2: PropSelector<TSource, TProp2>,
    prop3: PropSelector<TSource, TProp3>,
    sel: ((
      p1: ChangeNotification<TSource, TProp1>,
      p2: ChangeNotification<TSource, TProp2>,
      p3: ChangeNotification<TSource, TProp3>) => TRet)):
  Observable<ChangeNotification<TSource, TRet>>;

export function whenProperty<TSource, TProp1, TProp2, TProp3, TProp4, TRet>(
    target: TSource,
    prop1: PropSelector<TSource, TProp1>,
    prop2: PropSelector<TSource, TProp2>,
    prop3: PropSelector<TSource, TProp3>,
    prop4: PropSelector<TSource, TProp4>,
    sel: ((
      p1: ChangeNotification<TSource, TProp1>,
      p2: ChangeNotification<TSource, TProp2>,
      p3: ChangeNotification<TSource, TProp3>,
      p4: ChangeNotification<TSource, TProp4>) => TRet)):
  Observable<ChangeNotification<TSource, TRet>>;

export function whenProperty(target: any, ...propsAndSelector: Array<UntypedPropSelector>): Observable<any> {
  return whenPropertyInternal(target, false, ...propsAndSelector);
}
