var models = require('../models');
var async = require('async');

const copyPost = (fromPostId, toGroupId, options, done) => {
  var toGroup, toDomainId, toCommunityId;
  var toDomain;
  var newPost;
  var oldPost;
  var skipPointActivitiesIdsForPostCopy = [];

  async.series([
    function (callback) {
      models.Group.findOne({
        where: {
          id: toGroupId
        },
        include: [
          {
            model: models.Community,
            required: true,
            include: [
              {
                model: models.Domain,
                required: true
              }
            ]
          }
        ]
      }).then(function (groupIn) {
        toGroup = groupIn;
        toCommunityId = toGroup.Community.id;
        toDomainId = toGroup.Community.Domain.id;
        toDomain = toGroup.Community.Domain;
        callback();
      }).catch(function (error) {
        callback(error);
      });
    },
    function (callback) {
      models.Post.findOne({
        where: {
          id: fromPostId
        },
        include: [
          {
            model: models.Image,
            as: 'PostHeaderImages',
            attributes: ['id'],
            required: false
          },
          {
            model: models.Video,
            as: "PostVideos",
            attributes: ['id'],
            required: false
          },
          {
            model: models.Audio,
            as: "PostAudios",
            attributes: ['id'],
            required: false
          },
          {
            model: models.Image,
            as: 'PostUserImages',
            attributes: ['id'],
            required: false
          }
        ]
      }).then(function (postIn) {
        oldPost = postIn;
        if (!postIn) {
          console.error("No post in");
          callback("no post");
        } else {
          var postJson = JSON.parse(JSON.stringify(postIn.toJSON()));
          delete postJson['id'];
          newPost = models.Post.build(postJson);
          newPost.set('group_id', toGroup.id);
          if (options && options.toCategoryId) {
            newPost.set('category_id', options.toCategoryId);
          }
          newPost.save().then(function () {
            async.series(
              [
                (postSeriesCallback) => {
                  models.AcActivity.createActivity({
                    type: 'activity.post.copied',
                    userId: newPost.user_id,
                    domainId: toDomain.id,
                    groupId: newPost.group_id,
                    postId : newPost.id,
                    access: models.AcActivity.ACCESS_PRIVATE
                  }, function (error) {
                    postSeriesCallback(error);
                  });
                },
                (postSeriesCallback) => {
                  if (oldPost.PostVideos && oldPost.PostVideos.length>0) {
                    async.eachSeries(oldPost.PostVideos, function (media, mediaCallback) {
                      newPost.addPostVideo(media).then(function () {
                        mediaCallback();
                      }).catch((error) => {
                        mediaCallback(error);
                      });
                    }, function (error) {
                      postSeriesCallback(error);
                    });
                  } else {
                    postSeriesCallback();
                  }
                },
                (postSeriesCallback) => {
                  if (oldPost.PostAudios && oldPost.PostAudios.length>0) {
                    async.eachSeries(oldPost.PostAudios, function (media, mediaCallback) {
                      newPost.addPostAudio(media).then(function () {
                        mediaCallback();
                      }).catch((error) => {
                        mediaCallback(error);
                      });
                    }, function (error) {
                      postSeriesCallback(error);
                    });
                  } else {
                    postSeriesCallback();
                  }
                },
                (postSeriesCallback) => {
                  models.Endorsement.findAll({
                    where: {
                      post_id: oldPost.id
                    }
                  }).then(function (endorsements) {
                    async.eachSeries(endorsements, function (endorsement, endorsementCallback) {
                      var endorsementJson = JSON.parse(JSON.stringify(endorsement.toJSON()));
                      delete endorsementJson.id;
                      var endorsementModel = models.Endorsement.build(endorsementJson);
                      endorsementModel.set('post_id', newPost.id);
                      endorsementModel.save().then(function () {
                        models.AcActivity.createActivity({
                          type: endorsementModel.value>0 ? 'activity.post.endorsement.copied' : 'activity.post.opposition.copied',
                          userId: endorsementModel.user_id,
                          domainId: toDomain.id,
                          groupId: newPost.group_id,
                          postId : newPost.id,
                          access: models.AcActivity.ACCESS_PRIVATE
                        }, function (error) {
                          endorsementCallback(error);
                        });
                      }).catch((error) => {
                        endorsementCallback(error);
                      });
                    }, function (error) {
                      postSeriesCallback(error);
                    });
                  });
                },
                (postSeriesCallback) => {
                  models.Rating.findAll({
                    where: {
                      post_id: oldPost.id
                    }
                  }).then(function (ratings) {
                    async.eachSeries(ratings, function (rating, ratingCallback) {
                      var ratingJson = JSON.parse(JSON.stringify(rating.toJSON()));
                      delete rating.id;
                      var ratingModel = models.Endorsement.build(ratingJson);
                      ratingModel.set('post_id', newPost.id);
                      ratingModel.save().then(function () {
                        models.AcActivity.createActivity({
                          type: 'activity.post.rating.copied',
                          userId: ratingModel.user_id,
                          domainId: toDomain.id,
                          groupId: newPost.group_id,
                          postId : newPost.id,
                          access: models.AcActivity.ACCESS_PRIVATE
                        }, function (error) {
                          ratingCallback(error);
                        });
                      }).catch((error) => {
                        ratingCallback(error);
                      });
                    }, function (error) {
                      postSeriesCallback(error);
                    });
                  });
                },
                function (postSeriesCallback) {
                  models.PostRevision.findAll({
                    where: {
                      post_id: oldPost.id
                    }
                  }).then(function (postRevisions) {
                    async.eachSeries(postRevisions, function (postRevision, postRevisionCallback) {
                      var postRevisionJson =  JSON.parse(JSON.stringify(postRevision.toJSON()));
                      delete postRevisionJson.id;
                      var newPostRevision = models.PostRevision.build(postRevisionJson);
                      newPostRevision.set('post_id', newPost.id);
                      newPostRevision.save().then(function () {
                        postRevisionCallback();
                      }).catch((error) => {
                        postRevisionCallback(error);
                      });
                    }, function (error) {
                      postSeriesCallback(error);
                    });
                  });
                },
                function (postSeriesCallback) {
                  if (oldPost.PostUserImages && oldPost.PostUserImages.length>0) {
                    async.eachSeries(oldPost.PostUserImages, function (userImage, userImageCallback) {
                      newPost.addPostUserImage(userImage).then(function () {
                        userImageCallback();
                      }).catch((error) => {
                        userImageCallback(error);
                      });
                    }, function (error) {
                      postSeriesCallback(error);
                    });
                  } else {
                    postSeriesCallback();
                  }
                },
                function (postSeriesCallback) {
                  if (oldPost.PostHeaderImages && oldPost.PostHeaderImages.length>0) {
                    async.eachSeries(oldPost.PostHeaderImages, function (userImage, imageCallback) {
                      newPost.addPostHeaderImage(userImage).then(function () {
                        imageCallback();
                      }).catch((error) => {
                        imageCallback(error);
                      });
                    }, function (error) {
                      postSeriesCallback(error);
                    });
                  } else {
                    postSeriesCallback()
                  }
                }
              ], function (error) {
                console.log("Have copied post to group id");
                callback(error);
              });
          }).catch((error)=>{
            callback(error);
          });
        }
      })
    },
    function (callback) {
      if (options && options.copyPoints) {
        models.Point.findAll({
          where: {
            post_id: fromPostId
          },
          include: [
            {
              model: models.Video,
              as: "PointVideos",
              attributes: ['id'],
              required: false
            },
            {
              model: models.Audio,
              as: "PointAudios",
              attributes: ['id'],
              required: false
            }
          ]
        }).then(function (pointsIn) {
          async.eachSeries(pointsIn, function (point, innerSeriesCallback) {
            var pointJson = JSON.parse(JSON.stringify(point.toJSON()));
            var currentOldPoint = point;
            delete pointJson['id'];
            var newPoint = models.Point.build(pointJson);
            newPoint.set('group_id', toGroup.id);
            newPoint.set('community_id', toCommunityId);
            newPoint.set('domain_id', toDomainId);
            newPoint.set('post_id', newPost.id);
            newPoint.save().then(function () {
              async.series([
                (pointSeriesCallback) => {
                  models.AcActivity.createActivity({
                    type: 'activity.point.copied',
                    userId: newPost.user_id,
                    domainId: toDomain.id,
                    groupId: newPost.group_id,
                    postId : newPost.id,
                    pointId: newPoint.id,
                    access: models.AcActivity.ACCESS_PRIVATE
                  }, function (error) {
                    pointSeriesCallback(error);
                  });
                },
                function (pointSeriesCallback) {
                  models.PointQuality.findAll({
                    where: {
                      point_id: currentOldPoint.id
                    }
                  }).then(function (pointQualities) {
                    async.eachSeries(pointQualities, function (pointQuality, pointQualityCallback) {
                      var pointQualityJson = JSON.parse(JSON.stringify(pointQuality.toJSON()));
                      delete pointQualityJson.id;
                      var newPointQuality = models.PointQuality.build(pointQualityJson);
                      newPointQuality.set('point_id', newPoint.id);
                      newPointQuality.save().then(function () {
                        models.AcActivity.createActivity({
                          type: newPointQuality.value > 0 ? 'activity.point.helpful.copied' :  'activity.point.unhelpful.copied',
                          userId: newPointQuality.user_id,
                          domainId: toDomain.id,
                          groupId: newPost.group_id,
                          postId : newPost.id,
                          pointId: newPoint.id,
                          access: models.AcActivity.ACCESS_PRIVATE
                        }, function (error) {
                          pointQualityCallback(error);
                        });
                      }).catch((error) => {
                        pointQualityCallback(error);
                      });
                    }, function (error) {
                      pointSeriesCallback(error);
                    });
                  });
                },
                function (pointSeriesCallback) {
                  models.PointRevision.findAll({
                    where: {
                      point_id: currentOldPoint.id
                    }
                  }).then(function (pointRevisions) {
                    async.eachSeries(pointRevisions, function (pointRevision, pointRevisionCallback) {
                      var pointRevisionJson = JSON.parse(JSON.stringify(pointRevision.toJSON()));
                      delete pointRevisionJson.id;
                      var newPointRevision = models.PointRevision.build(pointRevisionJson);
                      newPointRevision.set('point_id', newPoint.id);
                      newPointRevision.save().then(function () {
                        pointRevisionCallback();
                      }).catch((error) => {
                        pointRevisionCallback(error);
                      });
                    }, function (error) {
                      pointSeriesCallback(error);
                    });
                  });
                },
                function (pointSeriesCallback) {
                  models.AcActivity.findAll({
                    where: {
                      point_id: currentOldPoint.id,
                      post_id: {$not: null }
                    }
                  }).then(function (activities) {
                    async.eachSeries(activities, function (activity, activitesSeriesCallback) {
                      skipPointActivitiesIdsForPostCopy.push(activity.id);
                      var activityJson = JSON.parse(JSON.stringify(activity.toJSON()));
                      delete activityJson.id;
                      var newActivity = models.AcActivity.build(activityJson);
                      newActivity.set('group_id', toGroup.id);
                      newActivity.set('community_id', toCommunityId);
                      newActivity.set('domain_id', toDomainId);
                      newActivity.set('point_id', newPoint.id);
                      newActivity.save().then(function (results) {
                        console.log("Have changed group and all activity: "+newActivity.id);
                        activitesSeriesCallback();
                      }).catch((error) => {
                        activitesSeriesCallback(error);
                      });
                    }, function (error) {
                      pointSeriesCallback(error);
                    })
                  });
                }
              ], function (error) {
                innerSeriesCallback(error);
              });
            })}, function (error) {
            console.log("Have changed group and all for point");
            callback();
          });
        });
      } else {
        callback();
      }
    },
    function (callback) {
      models.AcActivity.findAll({
        where: {
          post_id: oldPost.id,
          id: {
            $notIn: skipPointActivitiesIdsForPostCopy
          },
          point_id: { $is: null }
        }
      }).then(function (activities) {
        async.eachSeries(activities, function (activity, innerSeriesCallback) {
          var activityJson = JSON.parse(JSON.stringify(activity.toJSON()));
          delete activityJson.id;
          var newActivity = models.AcActivity.build(activityJson);
          newActivity.set('group_id', toGroup.id);
          newActivity.set('community_id', toCommunityId);
          newActivity.set('domain_id', toDomainId);
          newActivity.set('post_id', newPost.id);
          newActivity.save().then(function (results) {
            console.log("Have changed group and all activity: "+newActivity.id);
            innerSeriesCallback();
          }).catch((error) => {
            innerSeriesCallback(error);
          });
        }, function (error) {
          callback(error);
        })
      });
    }
  ], function (error) {
    console.log("Done copying post id "+fromPostId);
    if (error)
      console.error(error);
    done(error);
  })
};

const copyGroup = (fromGroupId, toCommunityId, options, done) => {
  let toDomainId;
  let toCommunity;
  let toDomain;
  let newGroup;
  let oldGroup;

  async.series([
    (callback) => {
      models.Community.findOne({
        where: {
          id: toCommunityId,
        },
        attributes: ['id'],
        include: [
          {
            model: models.Domain,
            attributes: ['id','theme_id','name']
          }
        ]
      }).then((communityIn) => {
        toCommunity = communityIn;
        toDomain = communityIn.Domain.id;
        toDomain = communityIn.Domain;
        callback();
      })
    },
    (callback) => {
      models.Group.findOne({
        where: {
          id: fromGroupId
        },
        include: [
          {
            model: models.Community,
            attributes: ['id','theme_id','name','access','google_analytics_code','configuration'],
            include: [
              {
                model: models.Domain,
                attributes: ['id','theme_id','name']
              }
            ]
          },
          {
            model: models.Category,
            required: false,
          },
          {
            model: models.User,
            attributes: ['id'],
            as: 'GroupAdmins',
            required: false
          },
          {
            model: models.User,
            attributes: ['id'],
            as: 'GroupUsers',
            required: false
          },
          {
            model: models.Image,
            as: 'GroupLogoImages',
            attributes:  models.Image.defaultAttributesPublic,
            required: false
          },
          {
            model: models.Video,
            as: 'GroupLogoVideos',
            attributes:  ['id','formats','viewable','public_meta'],
            required: false
          },
          {
            model: models.Image,
            as: 'GroupHeaderImages',
            attributes:  models.Image.defaultAttributesPublic,
            required: false
          }
        ]
      }).then(function (groupIn) {
        oldGroup = groupIn;
        var groupJson = JSON.parse(JSON.stringify(oldGroup.toJSON()));
        delete groupJson['id'];
        newGroup = models.Group.build(groupJson);
        newGroup.set('community_id', toCommunity.id);
        newGroup.save().then(function () {
          async.series(
            [
              (groupSeriesCallback) => {
                if (oldGroup.GroupLogoImages && oldGroup.GroupLogoImages.length>0) {
                  async.eachSeries(oldGroup.GroupLogoImages, function (image, mediaCallback) {
                    newGroup.addGroupLogoImage(image).then(function () {
                      mediaCallback();
                    }).catch((error) => {
                      mediaCallback(error);
                    });
                  }, function (error) {
                    groupSeriesCallback(error);
                  });
                } else {
                  groupSeriesCallback();
                }
              },
              (groupSeriesCallback) => {
                if (oldGroup.GroupHeaderImages && oldGroup.GroupHeaderImages.length>0) {
                  async.eachSeries(oldGroup.GroupHeaderImages, function (image, mediaCallback) {
                    newGroup.addGroupHeaderImage(image).then(function () {
                      mediaCallback();
                    }).catch((error) => {
                      mediaCallback(error);
                    });
                  }, function (error) {
                    groupSeriesCallback(error);
                  });
                } else {
                  groupSeriesCallback();
                }
              },
              (groupSeriesCallback) => {
                if (oldGroup.GroupLogoVideos && oldGroup.GroupLogoVideos.length>0) {
                  async.eachSeries(oldGroup.GroupLogoVideos, function (image, mediaCallback) {
                    newGroup.addGroupLogoVideo(image).then(function () {
                      mediaCallback();
                    }).catch((error) => {
                      mediaCallback(error);
                    });
                  }, function (error) {
                    groupSeriesCallback(error);
                  });
                } else {
                  groupSeriesCallback();
                }
              },
              (groupSeriesCallback) => {
                if (oldGroup.GroupAdmins && oldGroup.GroupAdmins.length>0) {
                  async.eachSeries(oldGroup.GroupAdmins, function (admin, adminCallback) {
                    newGroup.addGroupAdmin(admin).then(function () {
                      adminCallback();
                    }).catch((error)=>{
                      adminCallback(error);
                    });
                  }, function (error) {
                    groupSeriesCallback(error);
                  });
                } else {
                  groupSeriesCallback();
                }
              },
              (groupSeriesCallback) => {
                if (oldGroup.GroupUsers && oldGroup.GroupUsers.length>0) {
                  async.eachSeries(oldGroup.GroupUsers, function (user, userCallback) {
                    newGroup.addGroupUser(user).then(function () {
                      userCallback();
                    }).catch((error)=>{
                      userCallback(error);
                    });
                  }, function (error) {
                    groupSeriesCallback(error);
                  });
                } else {
                  groupSeriesCallback();
                }
              },
              (groupSeriesCallback) => {
                if (oldGroup.Categories && oldGroup.Categories.length>0) {
                  async.eachSeries(oldGroup.Categories, function (category, categoryCallback) {
                    delete category.id;
                    const newCategory = models.Category.build(JSON.parse(JSON.stringify(category.toJSON())));
                    newCategory.save(()=>{
                      categoryCallback();
                    }).catch((error)=>{
                      categoryCallback(error);
                    })
                  }, function (error) {
                    groupSeriesCallback(error);
                  });
                } else {
                  groupSeriesCallback();
                }
              },
              (groupSeriesCallback) => {
                if (options && options.copyPosts===true) {
                  models.Post.findAll({
                    where: {
                      group_id: oldGroup.id
                    },
                    attributes: ['id']
                  }).then((posts) => {
                    async.eachSeries(posts, function (post, postCallback) {
                      copyPost(post.id, newGroup.id, { copyPoints: options.copyPoints }, postCallback);
                    }, function (error) {
                      groupSeriesCallback(error);
                    });
                  }).catch((error) => {
                    groupSeriesCallback(error);
                  })
                } else {
                  groupSeriesCallback();
                }
              }
            ], function (error) {
              console.log("Have copied post to group id");
              callback(error);
            });
        });
      }).catch(function (error) {
        callback(error);
      });
    }
  ], function (error) {
    console.log("Done copying group");
    if (error)
      console.error(error);
    done(error);
  })
};

const copyCommunity = (fromCommunityId, toDomainId, options, done) => {
  let toDomain;
  let newCommunity=null;
  let oldCommunity;

  async.series([
    (callback) => {
      models.Domain.findOne({
        where: {
          id: toDomainId,
        },
        attributes: ['id']
      }).then((domainIn) => {
        toDomain = domainIn;
        callback();
      }).catch((error) => {
        callback(error);
      });
    },
    (callback) => {
      models.Community.findOne({
        where: {
          id: fromCommunityId
        },
        include: [
          {
            model: models.Domain,
            attributes: ['id','theme_id','name']
          },
          {
            model: models.User,
            attributes: ['id'],
            as: 'CommunityAdmins',
            required: false
          },
          {
            model: models.User,
            attributes: ['id'],
            as: 'CommunityUsers',
            required: false
          },
          {
            model: models.Image,
            as: 'CommunityLogoImages',
            attributes:  models.Image.defaultAttributesPublic,
            required: false
          },
          {
            model: models.Video,
            as: 'CommunityLogoVideos',
            attributes:  ['id','formats','viewable','public_meta'],
            required: false
          },
          {
            model: models.Image,
            as: 'CommunityHeaderImages',
            attributes:  models.Image.defaultAttributesPublic,
            required: false
          }
        ]
      }).then(function (communityIn) {
        oldCommunity = communityIn;
        var communityJson = JSON.parse(JSON.stringify(oldCommunity.toJSON()));
        delete communityJson['id'];
        newCommunity = models.Community.build(communityJson);
        newCommunity.set('domain_id', toDomain.id);
        if (newCommunity.hostname) {
          newCommunity.set('hostname', newCommunity.hostname+"-copy");
        }
        newCommunity.save().then(function () {
          async.series(
            [
              (communitySeriesCallback) => {
                if (oldCommunity.CommunityLogoImages && oldCommunity.CommunityLogoImages.length>0) {
                  async.eachSeries(oldCommunity.CommunityLogoImages, function (image, mediaCallback) {
                    newCommunity.addCommunityLogoImage(image).then(function () {
                      mediaCallback();
                    }).catch((error) => {
                      mediaCallback(error);
                    });
                  }, function (error) {
                    communitySeriesCallback(error);
                  });
                } else {
                  communitySeriesCallback();
                }
              },
              (communitySeriesCallback) => {
                if (oldCommunity.CommunityHeaderImages && oldCommunity.CommunityHeaderImages.length>0) {
                  async.eachSeries(oldCommunity.CommunityHeaderImages, function (image, mediaCallback) {
                    newCommunity.addCommunityHeaderImage(image).then(function () {
                      mediaCallback();
                    }).catch((error) => {
                      mediaCallback(error);
                    });
                  }, function (error) {
                    communitySeriesCallback(error);
                  });
                } else {
                  communitySeriesCallback();
                }
              },
              (communitySeriesCallback) => {
                if (oldCommunity.CommunityLogoVideos && oldCommunity.CommunityLogoVideos.length>0) {
                  async.eachSeries(oldCommunity.CommunityLogoVideos, function (image, mediaCallback) {
                    newCommunity.addCommunityLogoVideo(image).then(function () {
                      mediaCallback();
                    }).catch((error) => {
                      mediaCallback(error);
                    });
                  }, function (error) {
                    communitySeriesCallback(error);
                  });
                } else {
                  communitySeriesCallback();
                }
              },
              (communitySeriesCallback) => {
                if (oldCommunity.CommunityAdmins && oldCommunity.CommunityAdmins.length>0) {
                  async.eachSeries(oldCommunity.CommunityAdmins, function (admin, adminCallback) {
                    newCommunity.addCommunityAdmin(admin).then(function () {
                      adminCallback();
                    }).catch((error)=>{
                      adminCallback(error);
                    });
                  }, function (error) {
                    communitySeriesCallback(error);
                  });
                } else {
                  communitySeriesCallback();
                }
              },
              (communitySeriesCallback) => {
                if (oldCommunity.CommunityUsers && oldCommunity.CommunityUsers.length>0) {
                  async.eachSeries(oldCommunity.CommunityUsers, function (user, userCallback) {
                    newCommunity.addCommunityUser(user).then(function () {
                      userCallback();
                    }).catch((error)=>{
                      userCallback(error);
                    });
                  }, function (error) {
                    communitySeriesCallback(error);
                  });
                } else {
                  communitySeriesCallback();
                }
              },
              (communitySeriesCallback) => {
                if (options && options.copyGroups===true) {
                  models.Group.findAll({
                    where: {
                      community_id: oldCommunity.id
                    },
                    attributes: ['id']
                  }).then((groups) => {
                    async.eachSeries(groups, function (group, groupCallback) {
                      copyGroup(group.id, newCommunity.id, {
                        copyPosts: options.copyPosts,
                        copyPoints: options.copyPoints
                      }, groupCallback);
                    }, function (error) {
                      communitySeriesCallback(error);
                    });
                  }).catch((error) => {
                    communitySeriesCallback(error);
                  })
                } else {
                  communitySeriesCallback();
                }
              }
            ], function (error) {
              console.log("Have copied community");
              callback(error);
            });
        });
      }).catch(function (error) {
        callback(error);
      });
    }
  ], function (error) {
    console.log("Done copying community");
    if (error)
      console.error(error);
    done(error, typeof newCommunity!="undefined" ? newCommunity : null);
  });
};

const copyCommunityWithEverything = (communityId, toDomainId, done) => {
  copyCommunity(communityId, toDomainId, {
    copyGroups: true,
    copyPosts: true,
    copyPoints: true
  }, (error, newCommunity) => {
    if (newCommunity)
      console.log(newCommunity.id);
    if (error) {
      console.error(error);
      done(error);
    } else {
      //console.log("Done for new community "+ńewCommunity.id);
      done();
    }
  })
};

module.exports = {
  copyCommunityWithEverything,
  copyCommunity,
  copyGroup,
  copyPost
};
