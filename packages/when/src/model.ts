import { Observable , Subject, Subscription, SubscriptionLike as ISubscription } from 'rxjs';

import * as debug from 'debug';
// tslint:disable-next-line:no-require-imports
import isEqual = require('lodash.isequal');

import { MergeStrategy, Updatable } from './updatable';
import { PropSelector, SendingPropSelector } from './when';
import { propertySelectorToNames } from './when-helpers';

const d = debug('when:model');

export interface UntypedChangeNotification {
  sender: any;
  property: string;
  value?: any;
}

export interface ChangeNotification<TSender, TVal> extends UntypedChangeNotification {
  sender: TSender;
  property: string;
  value?: TVal;
}

export class Model {
  changing: Subject<UntypedChangeNotification>;
  changed: Subject<UntypedChangeNotification>;
  innerDisp: Subscription;

  constructor() {
    this.changing = new Subject();
    this.changed = new Subject();
    this.innerDisp = new Subscription();
  }

  unsubscribe() {
    this.innerDisp.unsubscribe();
  }

  addTeardown(teardown: ISubscription | Function | void) {
    this.innerDisp.add(teardown);
  }
}
export function notifyFor<T extends Model>(target: T, ...properties: Array<SendingPropSelector<T>>) {
    const proto = Object.getPrototypeOf(target);
    const names = properties.map(x => propertySelectorToNames(x, 1)[0]);

    for (const prop of names) {
      if (prop in proto) return;
      const descriptorList = getNotifyDescriptorsForProperty(
        prop, { configurable: true, enumerable: true });

      for (const k of Object.keys(descriptorList)) {
        Object.defineProperty(proto, k, descriptorList[k]);
      }
    }
  }

export function lazyFor<TModel extends Model, TVal>(
    target: TModel,
    property: PropSelector<TModel, TVal>,
    factory?: () => (Promise<TVal> | Observable<TVal>),
    strategy?: MergeStrategy) {
  const proto = Object.getPrototypeOf(target);
  const [name] = propertySelectorToNames(property, 1);
  const backingStoreName = `__${name}_Updatable__`;

  if (backingStoreName in proto) return;
  const upd = new Updatable(factory, strategy);
  toProperty(target, property, upd, (newVal: any) => {
    upd.next(newVal);
  });
}

export function toProperty<TModel extends Model, TVal>(
    target: TModel,
    property: PropSelector<TModel, TVal>,
    input: Observable<TVal>,
    setter?: ((x: TVal) => void)) {
  const [name] = propertySelectorToNames(property, 1);
  const obsPropertyKey: string = `___${name}_Observable`;

  if (obsPropertyKey in target) {
    throw new Error("Calling toProperty twice on the same property isn't supported");
  }

  enablePropertyAsObservable(target, name, setter);

  target[obsPropertyKey] = input;
  if (!setter) {
    // NB: Cause subscription to happen by calling the property's getter

    // tslint:disable-next-line:no-unused-expression
    target[name];
  }
}

export function invalidate<T extends Model>(target: T, property: SendingPropSelector<T>) {
  const [name] = propertySelectorToNames(property, 1);
  const obsPropertyKey: string = `___${name}_Observable`;

  if (target[obsPropertyKey] instanceof Updatable) {
    target[obsPropertyKey].invalidate();
  } else {
    target[name] = null;
  }
}

function getNotifyDescriptorsForProperty(name: string, descriptor: PropertyDescriptor) {
  const backingStoreName = `__${name}__`;

  const newDescriptor: PropertyDescriptor = {
    get: function(this: Model) { return this[backingStoreName]; },
    set: function(this: Model, newVal: any) {
      if (this[backingStoreName] === newVal) return;

      this.changing.next({sender: this, property: name, value: this[backingStoreName]});
      this[backingStoreName] = newVal;
      this.changed.next({sender: this, property: name, value: newVal});
    },
  };

  const realProp = Object.assign(newDescriptor, descriptor);

  const backingStoreProp = {
    value: undefined,
    writable: true,
    enumerable: false,
    configurable: false,
  };

  const ret: Object = {};
  ret[name] = realProp;
  ret[backingStoreName] = backingStoreProp;

  return ret;
}

function enablePropertyAsObservable(target: Model, propertyKey: string, setter?: ((v: any) => void)): void {
  const obsPropertyKey: string = `___${propertyKey}_Observable`;
  const valPropertyKey: string = `___${propertyKey}_Latest`;
  const subPropertyKey: string = `___${propertyKey}_Subscription`;
  const errPropertyKey: string = `___${propertyKey}_Error`;

  setter = setter || (() => {
    throw new Error(`Cannot set '${propertyKey}' on ${target.constructor.name}: Observable properties are read-only`);
  });

  if (obsPropertyKey in target) { return; }

  if (propertyKey in target) delete target[propertyKey];
  target[obsPropertyKey] = null;

  Object.defineProperty(target, propertyKey, {
    get: function(this: Model): any {
      if (!this[subPropertyKey]) {
        this[subPropertyKey] = new Subscription();

        const observableForProperty = this[obsPropertyKey] as Observable<any>;
        if (!observableForProperty) throw new Error(`Cannot find '${propertyKey}' on ${target.constructor.name}`);

        this[subPropertyKey].add(observableForProperty.subscribe(
          (x) => {
            if (isEqual(this[valPropertyKey], x)) return;

            this.changing.next({sender: target, property: propertyKey, value: this[valPropertyKey]});
            this[valPropertyKey] = x;
            this.changed.next({sender: target, property: propertyKey, value: this[valPropertyKey]});
          }, (e) => {
            d(`ToProperty on key ${propertyKey} failed! Last value was ${JSON.stringify(this[valPropertyKey])}`);
            this[errPropertyKey] = e;
          }, () => {
            d(`Observable for ${propertyKey} completed!`);
          }));

        this[subPropertyKey].add(() => {
          if (this[valPropertyKey] instanceof Model) this[valPropertyKey].unsubscribe();
          this[obsPropertyKey] = null;
          this[valPropertyKey] = null;
        });

        this.innerDisp.add(this[subPropertyKey]);
      }

      if (this[errPropertyKey]) {
        throw this[errPropertyKey];
      }

      return this[valPropertyKey];
    },
    set: setter,
  });
}
