import { Observable , Subject, Subscription, SubscriptionLike as ISubscription } from 'rxjs';

import * as debug from 'debug';
// tslint:disable-next-line:no-require-imports
import isEqual = require('lodash.isequal');

import { MergeStrategy, Updatable } from './updatable';
import { UntypedPropSelector } from './when';
import { chainToProps } from './when-helpers';

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

  notifyFor(...properties: Array<UntypedPropSelector>) {
    const proto = Object.getPrototypeOf(this);
    const names = properties.map(x => chainToProps(x, 1)[0]);

    for (const prop of names) {
      if (prop in proto) return;
      const descriptorList = getNotifyDescriptorsForProperty(
        prop, { configurable: true, enumerable: true });

      for (const k of Object.keys(descriptorList)) {
        Object.defineProperty(proto, k, descriptorList[k]);
      }
    }
  }

  lazyFor<T>(
      property: UntypedPropSelector,
      factory?: () => (Promise<T>|Observable<T>),
      strategy?: MergeStrategy) {
    const proto = Object.getPrototypeOf(this);
    const [name] = chainToProps(property, 1);
    const backingStoreName = `__${name}_Updatable__`;

    if (backingStoreName in proto) return;
    this.toProperty(new Updatable(factory, strategy), property);
  }

  toProperty<T>(input: Observable<T>, property: UntypedPropSelector) {
    const [name] = chainToProps(property, 1);
    const obsPropertyKey: string = `___${name}_Observable`;

    if (obsPropertyKey in this) {
      throw new Error("Calling toProperty twice on the same property isn't supported");
    }

    enablePropertyAsObservable(this, name);

    this[obsPropertyKey] = input;
    // tslint:disable-next-line:no-unused-expression
    this[name];
  }

  invalidate(property: UntypedPropSelector) {
    const [name] = chainToProps(property, 1);
    const obsPropertyKey: string = `___${name}_Observable`;

    if (this[obsPropertyKey] instanceof Updatable) {
      this[obsPropertyKey].invalidate();
    } else {
      this[name] = null;
    }
  }

  unsubscribe() {
    this.innerDisp.unsubscribe();
  }

  addTeardown(teardown: ISubscription | Function | void) {
    this.innerDisp.add(teardown);
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

function enablePropertyAsObservable(target: Model, propertyKey: string): void {
  const obsPropertyKey: string = `___${propertyKey}_Observable`;
  const valPropertyKey: string = `___${propertyKey}_Latest`;
  const subPropertyKey: string = `___${propertyKey}_Subscription`;

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
            setTimeout(() => { throw e; }, 10);
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

      return this[valPropertyKey];
    },
    set: () => {
      throw new Error(`Cannot set '${propertyKey}' on ${target.constructor.name}: Observable properties are read-only`);
    },
  });
}
